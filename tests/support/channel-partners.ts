import type { Locator, Page } from "@playwright/test";
import { expect, test as base } from "@playwright/test";
import { ensureActiveProject } from "./auth";

type AppConfig = {
  activeProjectName: string;
};

const FALLBACK_RENDER_WAIT_MS = 5000;

async function clickWithFallback(
  page: Page,
  locator: Locator,
  postCheck?: () => Promise<boolean>,
  options?: Parameters<Locator["click"]>[0],
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

async function clickFirstVisible(locators: Locator[]) {
  for (const locator of locators) {
    const candidate = locator.first();
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.scrollIntoViewIfNeeded().catch(() => {});
      await candidate.click({ force: true });
      return true;
    }
  }

  return false;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function tabName(label: string) {
  if (label === "All CP") {
    return /^All CP'?s?(?:\s+\d+)?$/i;
  }

  return new RegExp(`^${label}(?:\\s+\\d+)?$`, "i");
}

async function waitForLoadingToFinish(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect
    .poll(async () => {
      const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
      return !/\bloading\b|fetching|please wait/i.test(bodyText);
    }, { timeout: 15000 })
    .toBeTruthy()
    .catch(() => {});
}

async function waitForChannelPartnerListing(page: Page) {
  await waitForLoadingToFinish(page);

  await expect
    .poll(async () => {
      const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
      const allTabVisible = await page.getByRole("tab", { name: tabName("All CP") }).isVisible().catch(() => false);
      const unregisteredTabVisible = await page.getByRole("tab", { name: tabName("Unregistered") }).isVisible().catch(() => false);
      const registeredTabVisible = await page.getByRole("tab", { name: tabName("Registered") }).isVisible().catch(() => false);

      return (
        /channel partner|all cp|unregistered|registered/i.test(bodyText) &&
        allTabVisible &&
        unregisteredTabVisible &&
        registeredTabVisible
      );
    }, { timeout: 60000 })
    .toBeTruthy();
}

export async function goToChannelPartnerListing(page: Page, app: AppConfig) {
  await base.step("Open Channel Partner listing", async () => {
    await page.goto("/admin/developer/cpms/manage-construction", {
      waitUntil: "networkidle",
    });
    await ensureActiveProject(page, app.activeProjectName);

    const channelPartnerEntryPoints = [
      page.getByRole("button", { name: /channel partner/i }),
      page.getByRole("link", { name: /channel partner/i }),
      page.locator("button").filter({ hasText: /channel partner/i }),
      page.locator("a").filter({ hasText: /channel partner/i }),
    ];

    const opened = await clickFirstVisible(channelPartnerEntryPoints);
    if (!opened) {
      throw new Error('The "Channel Partner" entry point was not visible from the landing page.');
    }

    await waitForChannelPartnerListing(page);
  });
}

export async function selectChannelPartnerTab(page: Page, label: "Unregistered" | "Registered") {
  await base.step(`Open ${label} CP tab`, async () => {
    const tab = page.getByRole("tab", { name: tabName(label) });
    await expect(tab).toBeVisible({ timeout: 30000 });
    await clickWithFallback(
      page,
      tab,
      async () => await tab.evaluate((element) => element.getAttribute("aria-selected") === "true").catch(() => false),
    );
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 30000 });
    await waitForLoadingToFinish(page);
  });
}

export async function expectChannelPartnerListVisible(page: Page) {
  await base.step("Verify CP list is visible", async () => {
    await waitForLoadingToFinish(page);

    const listCandidates = [
      page.locator('a[href*="/channel-partners/channel-partner-qualification"]').first(),
      page.getByRole("table").first(),
      page.getByRole("row").filter({ hasText: /\S/ }).nth(1),
      page.locator("table tbody tr").filter({ hasText: /\S/ }).first(),
      page.locator("[role='row']").filter({ hasText: /\S/ }).nth(1),
      page.locator("[class*='table'] [class*='row']").filter({ hasText: /\S/ }).first(),
      page.locator("[class*='card'], [class*='Card']").filter({ hasText: /cp|partner|registered|unregistered/i }).first(),
    ];

    for (const candidate of listCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        await expect(candidate).toBeVisible();
        return;
      }
    }

    const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
    throw new Error(`CP list was not visible. Page text: ${bodyText.slice(0, 500)}`);
  });
}

export async function expectChannelPartnerListFilteredByStage(
  page: Page,
  stage: "Unregistered" | "Registered",
) {
  await base.step(`Verify ${stage} CP list is visible`, async () => {
    await waitForLoadingToFinish(page);

    const activeTab = page.getByRole("tab", { name: tabName(stage) });
    const cpRows = page.locator('a[href*="/channel-partners/channel-partner-qualification"]');

    await expect(activeTab).toHaveAttribute("aria-selected", "true", { timeout: 30000 });

    await expect
      .poll(async () => {
        return await cpRows.count().catch(() => 0);
      }, { timeout: 30000 })
      .toBeGreaterThan(0);

    await expect(cpRows.first()).toBeVisible();
  });
}
