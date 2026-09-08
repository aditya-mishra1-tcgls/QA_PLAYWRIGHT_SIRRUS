import { expect, type Page } from "@playwright/test";
import { ProjectSwitcherPage } from "./ProjectSwitcherPage";
import { clickWithFallback, normalizeText, tryClickFirstVisible } from "../support/ui-actions";

export type ChannelPartnerAppConfig = {
  activeProjectName: string;
};

export type ChannelPartnerStage = "Unregistered" | "Registered";

export class ChannelPartnerPage {
  constructor(private readonly page: Page) {}

  async open(app: ChannelPartnerAppConfig) {
    await this.page.goto("/admin/developer/cpms/manage-construction", {
      waitUntil: "networkidle",
    });
    await new ProjectSwitcherPage(this.page).ensureActiveProject(app.activeProjectName);

    const opened = await tryClickFirstVisible(
      [
        this.page.getByRole("button", { name: /channel partner/i }),
        this.page.getByRole("link", { name: /channel partner/i }),
        this.page.locator("button").filter({ hasText: /channel partner/i }),
        this.page.locator("a").filter({ hasText: /channel partner/i }),
      ],
      { force: true },
    );

    if (!opened) {
      throw new Error('The "Channel Partner" entry point was not visible from the landing page.');
    }

    await this.waitForListing();
  }

  async selectTab(label: ChannelPartnerStage) {
    const tab = this.page.getByRole("tab", { name: this.tabName(label) });
    await expect(tab).toBeVisible({ timeout: 30000 });
    await clickWithFallback(
      tab,
      this.page,
      async () => await tab.evaluate((element) => element.getAttribute("aria-selected") === "true").catch(() => false),
    );
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 30000 });
    await this.waitForLoadingToFinish();
  }

  async expectListVisible() {
    await this.waitForLoadingToFinish();

    const listCandidates = [
      this.page.locator('a[href*="/channel-partners/channel-partner-qualification"]').first(),
      this.page.getByRole("table").first(),
      this.page.getByRole("row").filter({ hasText: /\S/ }).nth(1),
      this.page.locator("table tbody tr").filter({ hasText: /\S/ }).first(),
      this.page.locator("[role='row']").filter({ hasText: /\S/ }).nth(1),
      this.page.locator("[class*='table'] [class*='row']").filter({ hasText: /\S/ }).first(),
      this.page.locator("[class*='card'], [class*='Card']").filter({ hasText: /cp|partner|registered|unregistered/i }).first(),
    ];

    for (const candidate of listCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        await expect(candidate).toBeVisible();
        return;
      }
    }

    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    throw new Error(`CP list was not visible. Page text: ${bodyText.slice(0, 500)}`);
  }

  async expectListFilteredByStage(stage: ChannelPartnerStage) {
    await this.waitForLoadingToFinish();

    const activeTab = this.page.getByRole("tab", { name: this.tabName(stage) });
    const cpRows = this.page.locator('a[href*="/channel-partners/channel-partner-qualification"]');

    await expect(activeTab).toHaveAttribute("aria-selected", "true", { timeout: 30000 });

    await expect
      .poll(async () => {
        return await cpRows.count().catch(() => 0);
      }, { timeout: 30000 })
      .toBeGreaterThan(0);

    await expect(cpRows.first()).toBeVisible();
  }

  private tabName(label: string) {
    if (label === "All CP") {
      return /^All CP'?s?(?:\s+\d+)?$/i;
    }

    return new RegExp(`^${label}(?:\\s+\\d+)?$`, "i");
  }

  private async waitForLoadingToFinish() {
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        return !/\bloading\b|fetching|please wait/i.test(bodyText);
      }, { timeout: 15000 })
      .toBeTruthy()
      .catch(() => {});
  }

  private async waitForListing() {
    await this.waitForLoadingToFinish();

    await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        const allTabVisible = await this.page.getByRole("tab", { name: this.tabName("All CP") }).isVisible().catch(() => false);
        const unregisteredTabVisible = await this.page.getByRole("tab", { name: this.tabName("Unregistered") }).isVisible().catch(() => false);
        const registeredTabVisible = await this.page.getByRole("tab", { name: this.tabName("Registered") }).isVisible().catch(() => false);

        return (
          /channel partner|all cp|unregistered|registered/i.test(bodyText) &&
          allTabVisible &&
          unregisteredTabVisible &&
          registeredTabVisible
        );
      }, { timeout: 60000 })
      .toBeTruthy();
  }
}
