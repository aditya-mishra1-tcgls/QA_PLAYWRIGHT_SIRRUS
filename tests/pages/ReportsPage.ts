import { expect, type Locator, type Page } from "@playwright/test";
import { ProjectSwitcherPage } from "./ProjectSwitcherPage";
import { ensureAuthenticatedSession } from "../support/session";
import {
  clickWithFallback,
  hasVisibleHeading,
  hasVisibleText,
  normalizeText,
} from "../support/ui-actions";

export type ReportsAppConfig = {
  baseUrl?: string;
  activeProjectName: string;
  mobileNumber?: string;
  otp?: string;
};

export class ReportsPage {
  constructor(private readonly page: Page) {}

  get reportsDashboardButtonCandidates(): Locator[] {
    return [
      this.page.getByRole("button", { name: /reports dashboard/i }),
      this.page.getByRole("link", { name: /reports dashboard/i }),
      this.page.getByText(/^reports dashboard$/i).first(),
      this.page.getByText(/reports dashboard/i).first(),
    ];
  }

  async open(app: ReportsAppConfig) {
    await this.page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "domcontentloaded" });
    await ensureAuthenticatedSession(this.page, app, "/admin/developer/cpms/manage-construction");
    app.activeProjectName = await new ProjectSwitcherPage(this.page).ensureActiveProject(app.activeProjectName);

    let opened = false;
    for (const candidate of this.reportsDashboardButtonCandidates) {
      if (!await candidate.first().isVisible().catch(() => false)) {
        continue;
      }

      await clickWithFallback(
        candidate.first(),
        this.page,
        async () => await this.dashboardIsReady(),
        { force: true },
      ).catch(() => {});
      opened = await this.dashboardIsReady();
      if (opened) {
        break;
      }
    }

    if (!opened) {
      throw new Error('The "Reports Dashboard" entry point was not visible from the landing page.');
    }

    await this.waitForReady();
  }

  async waitForReady() {
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await expect
      .poll(() => this.dashboardIsReady(), { timeout: 60000 })
      .toBeTruthy();
  }

  private async dashboardIsReady() {
    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    const hasDashboardHeading = await hasVisibleHeading(this.page, /Reports Dashboard/i);
    const hasDashboardControls = await hasVisibleText(this.page, /Create Dashboard|Create Chart|Create New/i);

    return (
      hasDashboardHeading ||
      hasDashboardControls ||
      /Reports Dashboard|Create Dashboard|Create Chart|Create New/i.test(bodyText)
    );
  }
}
