import { expect, type Page } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";

export type SessionAppConfig = {
  baseUrl?: string;
  mobileNumber?: string;
  otp?: string;
};

type SessionState = "authenticated" | "login" | "pending";

export async function ensureAuthenticatedSession(
  page: Page,
  app: SessionAppConfig,
  returnPath?: string,
) {
  const state = await waitForSessionState(page);
  if (state === "authenticated") {
    return;
  }

  if (!app.baseUrl || !app.mobileNumber || !app.otp) {
    throw new Error("Authenticated session expired and login credentials were not available to recover it.");
  }

  await page.context().clearCookies();
  await page.goto(app.baseUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  }).catch(() => {});

  await new LoginPage(page).login({
    baseUrl: app.baseUrl,
    mobileNumber: app.mobileNumber,
    otp: app.otp,
  });

  if (returnPath) {
    await page.goto(returnPath, { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => await currentSessionState(page), { timeout: 30000 })
      .toBe("authenticated");
  }
}

async function waitForSessionState(page: Page) {
  let lastState: SessionState = "pending";

  for (let attempt = 0; attempt < 30; attempt += 1) {
    lastState = await currentSessionState(page);
    if (lastState === "authenticated") {
      await page.waitForTimeout(1500);
      if (await currentSessionState(page) === "authenticated") {
        return lastState;
      }
    }

    if (lastState === "login") {
      return lastState;
    }

    await page.waitForTimeout(500);
  }

  return "login";
}

async function currentSessionState(page: Page): Promise<SessionState> {
  const url = page.url();
  const onLoginPage =
    /\/admin\/login/i.test(url) ||
    (await page.getByRole("heading", { name: /Mobile Number/i }).isVisible().catch(() => false)) ||
    (await page.getByRole("textbox", { name: /Enter Mobile Number/i }).isVisible().catch(() => false));

  if (onLoginPage) {
    return "login";
  }

  const appShellCandidates = [
    page.locator('img[alt*="Profile" i]').first(),
    page.locator('img[alt*="engagement" i]').first(),
    page.locator('img[alt*="receptionist" i]').first(),
    page.getByRole("button", { name: /engagement Intelligence/i }).first(),
    page.getByRole("button", { name: /receptionist forms/i }).first(),
    page.getByText(/Lead Funnel|AI-Prioritized|Manage Leads|Dashboard/i).first(),
  ];
  const hasAppShell = await Promise
    .all(appShellCandidates.map((candidate) => candidate.isVisible().catch(() => false)))
    .then((results) => results.some(Boolean));

  if (/\/admin\//i.test(url) && hasAppShell) {
    return "authenticated";
  }

  return "pending";
}
