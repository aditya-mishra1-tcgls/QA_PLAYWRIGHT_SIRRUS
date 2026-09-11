import { expect, type Page } from "@playwright/test";
import { LeadListPage, type LeadListAppConfig } from "./LeadListPage";
import { clickWithFallback } from "../support/ui-actions";

export class LeadDashboardPage {
  constructor(private readonly page: Page) {}

  get engagementModuleButton() {
    return this.page
      .locator("button")
      .filter({
        has: this.page.locator('img[alt*="engagement" i], img[alt*="Engagement" i]'),
      })
      .first();
  }

  get leadDashboardTab() {
    return this.page.getByRole("tab", { name: "Lead Dashboard" }).first();
  }

  async open(app: LeadListAppConfig) {
    await new LeadListPage(this.page).gotoManageConstruction(app);
    await expect(this.engagementModuleButton).toBeVisible({ timeout: 60000 });
    await clickWithFallback(
      this.engagementModuleButton,
      this.page,
      async () => await this.leadDashboardTab.isVisible().catch(() => false),
    );
    await clickWithFallback(
      this.leadDashboardTab,
      this.page,
      async () =>
        await this.page
          .getByText(/Lead Funnel & Conversion|AI-Prioritized Executive Tasks/i)
          .first()
          .isVisible()
          .catch(() => false),
      { force: true },
    );
  }

  async expectDashboardOverviewVisible() {
    await expect(this.page.getByText("Lead Funnel & Conversion")).toBeVisible({
      timeout: 60000,
    });
    await expect(this.page.getByText("AI-Prioritized Executive Tasks")).toBeVisible({
      timeout: 60000,
    });
    await expect(this.page.getByRole("button", { name: "New Lead" })).toBeVisible();
    await expect(this.page.getByRole("button", { name: "Select executives" }).first()).toBeVisible();
    await expect(this.page.getByRole("button", { name: "Last 7 Days" }).first()).toBeVisible();
    await expect(this.page.getByRole("button", { name: "Manage Leads" })).toBeVisible();

    for (const label of [
      "New Lead",
      "Site Visit",
      "Booked",
      "Avg First Response Time",
      "Site Visit Conversion Rate",
      "Booking Conversion Rate",
      "Sales Cycle",
      "Real-time view of funnel health, conversions, and sales velocity from new lead to booking",
    ]) {
      await expect(this.page.locator("body")).toContainText(label);
    }
  }
}
