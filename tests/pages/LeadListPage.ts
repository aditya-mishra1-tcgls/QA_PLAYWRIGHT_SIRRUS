import { expect, type Page } from "@playwright/test";
import { LoginPage } from "./LoginPage";
import { ProjectSwitcherPage } from "./ProjectSwitcherPage";
import {
  clickWithFallback,
  escapeRegex,
  hasVisibleHeading,
  hasVisibleText,
  normalizeText,
} from "../support/ui-actions";

export type LeadListAppConfig = {
  baseUrl?: string;
  activeProjectName: string;
  mobileNumber?: string;
  otp?: string;
};

export class LeadListPage {
  constructor(private readonly page: Page) {}

  get searchInput() {
    return this.page.locator("#search");
  }

  get addLeadButton() {
    return this.page.getByText("Add Lead", { exact: true });
  }

  get engagementModuleButton() {
    return this.page
      .locator("button")
      .filter({
        has: this.page.locator('img[alt*="engagement" i], img[alt*="Engagement" i]'),
      })
      .first();
  }

  get manageLeadsButton() {
    return this.page.getByRole("button", { name: /manage leads/i });
  }

  leadNameText(leadName: string) {
    return this.page.getByText(new RegExp(`^${escapeRegex(leadName)}$`, "i")).first();
  }

  async gotoManageConstruction(app: LeadListAppConfig) {
    await this.page.goto("/admin/developer/cpms/manage-construction", {
      waitUntil: "networkidle",
    });
    await this.loginAgainIfSessionExpired(app);
    await new ProjectSwitcherPage(this.page).ensureActiveProject(app.activeProjectName);
    await this.waitForManageConstructionContent();
  }

  async openManageLeads(app: LeadListAppConfig) {
    await this.gotoManageConstruction(app);

    await expect(this.engagementModuleButton).toBeVisible({ timeout: 60000 });
    await clickWithFallback(
      this.engagementModuleButton,
      this.page,
      async () => await this.manageLeadsButton.isVisible().catch(() => false),
    );
    const clickedManageLeads = await this.manageLeadsButton
      .click({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    const manageLeadsOpened = clickedManageLeads
      ? await this.page
          .waitForURL(/engagement-intelligence\/manage-leads/, {
            timeout: 15000,
          })
          .then(() => true)
          .catch(() => false)
      : false;

    if (!manageLeadsOpened) {
      await this.page.goto("/admin/developer/engagement-intelligence/manage-leads", {
        waitUntil: "domcontentloaded",
      });
    }

    await this.waitForListingReady();
  }

  async searchLead(leadName: string) {
    await expect(this.searchInput).toBeVisible({ timeout: 30000 });
    await this.searchInput.fill(leadName);
    await this.searchInput.press("Enter").catch(() => {});
  }

  async expectLeadVisible(leadName: string) {
    await this.searchLead(leadName);
    await expect(this.leadNameText(leadName)).toBeVisible({ timeout: 60000 });
  }

  async openLeadByName(leadName: string) {
    await this.searchLead(leadName);

    await expect
      .poll(
        async () => await this.leadNameText(leadName).isVisible().catch(() => false),
        { timeout: 60000 },
      )
      .toBeTruthy();

    const leadLinkCandidates = [
      this.page
        .getByRole("link", {
          name: new RegExp(`^${escapeRegex(leadName)}$`, "i"),
        })
        .first(),
      this.page
        .locator('a[href*="manage-leads"][href*="id="]')
        .filter({ hasText: new RegExp(`^${escapeRegex(leadName)}$`, "i") })
        .first(),
      this.leadNameText(leadName),
    ];

    for (const candidate of leadLinkCandidates) {
      if (!(await candidate.isVisible().catch(() => false))) {
        continue;
      }

      await candidate.click({ force: true }).catch(() => {});
      const opened = await this.page
        .waitForURL(/engagement-intelligence\/manage-leads\/?\?id=/, {
          timeout: 15000,
        })
        .then(() => true)
        .catch(() => false);
      if (opened) {
        return;
      }
    }

    throw new Error(`Lead "${leadName}" was visible in search results, but no clickable lead link opened its profile.`);
  }

  private async waitForManageConstructionContent() {
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});

    await expect
      .poll(async () => {
        const currentUrl = this.page.url();
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        const isOnManageConstruction = /\/admin\/developer\/cpms\/manage-construction/i.test(currentUrl);
        const hasManageConstructionShell = await hasVisibleHeading(this.page, /Manage Construction/i);
        const hasLandingModules = await hasVisibleText(this.page, /Schedule Control|Site Tracker|Saved Reports/i);

        return (
          isOnManageConstruction &&
          (hasManageConstructionShell ||
            hasLandingModules ||
            /Manage Construction/i.test(bodyText))
        );
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  private async waitForListingReady() {
    await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        const hasLeadFeatureText = /Manage Leads|Lead ID|Add Lead|Lead Profile/i.test(bodyText);
        const hasSearch = await this.searchInput.isVisible().catch(() => false);
        return hasLeadFeatureText || hasSearch;
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  private async loginAgainIfSessionExpired(app: LeadListAppConfig) {
    const onLoginPage =
      /\/admin\/login/i.test(this.page.url()) ||
      (await this.page.getByRole("heading", { name: /Mobile Number/i }).isVisible().catch(() => false));

    if (!onLoginPage) {
      return;
    }

    if (!app.baseUrl || !app.mobileNumber || !app.otp) {
      throw new Error("Authenticated session expired and login credentials were not available to recover it.");
    }

    await new LoginPage(this.page).login({
      baseUrl: app.baseUrl,
      mobileNumber: app.mobileNumber,
      otp: app.otp,
    });
    await this.page.goto("/admin/developer/cpms/manage-construction", {
      waitUntil: "networkidle",
    });
  }
}
