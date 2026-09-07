import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test as base, type Locator } from "@playwright/test";

type AppConfig = {
  envName: string;
  baseUrl: string;
  activeProjectName: string;
  mobileNumber: string;
  otp: string;
};

export function getAuthStatePath(envName: string) {
  return path.resolve("playwright", ".auth", `${envName}.json`);
}

const FALLBACK_RENDER_WAIT_MS = 5000;

async function clickWithFallback(
  locator: Locator,
  page: Page,
  postCheck?: () => Promise<boolean>,
  options?: Parameters<Locator["click"]>[0]
) {
  await locator.click(options);

  if (!postCheck) {
    return;
  }

  const ready = await expect
    .poll(postCheck, { timeout: 1500 })
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);

  if (!ready) {
    await page.waitForTimeout(FALLBACK_RENDER_WAIT_MS);
  }
}

async function waitForProjectSwitcher(page: Page) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const projectSwitcherCandidates = await page.locator("button").all();

    for (const candidate of projectSwitcherCandidates) {
      const text = (await candidate.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      const isVisible = await candidate.isVisible().catch(() => false);
      if (!isVisible) {
        continue;
      }

      const isProfileOrAccountButton = /aakarsh|admin|logout|account/i.test(text);
      const looksLikeProjectButton = /tower|test|project|builders|residency/i.test(text);

      if (looksLikeProjectButton && !isProfileOrAccountButton) {
        return candidate;
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error("Project switcher was not visible after login.");
}

async function waitForProjectApplied(page: Page, projectName: string) {
  const selectedProject = page.getByRole("button", { name: new RegExp(projectName, "i") }).last();
  await expect
    .poll(
      async () => await selectedProject.isVisible().catch(() => false),
      {
        intervals: [500, 500, 500, 500, 500, 500, 500, 500],
        timeout: 10000,
      },
    )
    .toBeTruthy();
}

async function scrollProjectDropdown(page: Page) {
  return await page.evaluate(() => {
    const scrollableDivs = Array.from(document.querySelectorAll("div")).filter((element) => {
      const htmlElement = element as HTMLDivElement;
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        htmlElement.scrollHeight > htmlElement.clientHeight &&
        (style.overflowY === "auto" || style.overflowY === "scroll")
      );
    });

    for (const element of scrollableDivs) {
      const htmlElement = element as HTMLDivElement;
      const previousTop = htmlElement.scrollTop;
      htmlElement.scrollTop = Math.min(
        htmlElement.scrollTop + Math.max(Math.floor(htmlElement.clientHeight * 0.8), 220),
        htmlElement.scrollHeight
      );

      if (htmlElement.scrollTop !== previousTop) {
        return true;
      }
    }

    return false;
  });
}

async function chooseConfiguredProject(page: Page, projectName: string) {
  const optionLocator = page.locator("button").filter({ hasText: /\S/ });
  await expect
    .poll(async () => {
      const count = await optionLocator.count().catch(() => 0);
      return count > 0;
    }, { timeout: 30000 })
    .toBeTruthy();

  const escapedProjectName = projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matchingOption = optionLocator
    .filter({ hasText: new RegExp(escapedProjectName, "i") })
    .filter({
      hasNotText: /Agrawal builders|AIPL Riviera|Centralis|Channel partner|Citrine Crest/i
    })
    .first();
  if (await matchingOption.isVisible().catch(() => false)) {
    await matchingOption.click({ force: true });
    return;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await matchingOption.isVisible().catch(() => false)) {
      await matchingOption.click({ force: true });
      return;
    }

    const scrolled = await scrollProjectDropdown(page);
    if (!scrolled) {
      break;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`Configured project "${projectName}" was not visible in the project switcher.`);
}

export async function ensureActiveProject(page: Page, projectName: string) {
  const selectedProject = page.getByRole("button", { name: new RegExp(projectName, "i") }).last();
  if (await selectedProject.isVisible().catch(() => false)) {
    await waitForProjectApplied(page, projectName);
    return;
  }

  const projectSwitcher = await waitForProjectSwitcher(page);
  await clickWithFallback(
    projectSwitcher,
    page,
    async () => await page.locator("button").filter({ hasText: /\S/ }).first().isVisible().catch(() => false)
  );
  await chooseConfiguredProject(page, projectName);
  await waitForProjectApplied(page, projectName);

  if (!await page.getByRole("button", { name: new RegExp(projectName, "i") }).last().isVisible().catch(() => false)) {
    throw new Error(`Unable to switch active project to "${projectName}".`);
  }
}

export async function loginToPlatform(page: Page, app: AppConfig) {
  await base.step("Open login page", async () => {
    await page.goto(app.baseUrl, { waitUntil: "domcontentloaded" });
    await clickWithFallback(
      page.getByRole("link", { name: /log in/i }),
      page,
      async () => await page.locator("#mobile_number").isVisible().catch(() => false)
    );

    await expect(page).toHaveURL(/\/admin\/login/);
  });

  await base.step("Enter mobile number", async () => {
    await page.locator("#mobile_number").fill(app.mobileNumber);
  });

  const otpInputs = page.locator('input[inputmode="numeric"]');
  await base.step("Request OTP", async () => {
    await clickWithFallback(
      page.getByRole("button", { name: "Continue" }),
      page,
      async () => (await otpInputs.count().catch(() => 0)) === 4
    );

    await expect(otpInputs).toHaveCount(4, { timeout: 30000 });
  });

  await base.step("Enter OTP", async () => {
    for (const [index, digit] of app.otp.split("").entries()) {
      await otpInputs.nth(index).click();
      await otpInputs.nth(index).pressSequentially(digit, { delay: 10 });
    }
  });

  await base.step("Submit login", async () => {
    const continueButton = page.getByRole("button", { name: "Continue" });
    const loggedInUserResponse = page.waitForResponse((response) => {
      return response.url().includes("/users/loggedInUser") && response.ok();
    }, { timeout: 60000 });

    if (await continueButton.isVisible()) {
      await continueButton.click();
    }

    await loggedInUserResponse;
    await page.waitForURL(/\/admin\/(?!login)/, { timeout: 60000 });
    await expect(page).toHaveURL(/\/admin\/(?!login)/);
  });

  await base.step("Select active project", async () => {
    await ensureActiveProject(page, app.activeProjectName);
  });
}

export async function saveAuthenticatedState(page: Page, envName: string) {
  await base.step("Save authenticated session", async () => {
    const authStatePath = getAuthStatePath(envName);
    fs.mkdirSync(path.dirname(authStatePath), { recursive: true });
    await page.context().storageState({ path: authStatePath });
  });
}
