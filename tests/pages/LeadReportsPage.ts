import { expect, type Download, type Locator, type Page } from "@playwright/test";
import { LeadListPage, type LeadListAppConfig } from "./LeadListPage";
import { ProjectSwitcherPage } from "./ProjectSwitcherPage";
import { clickWithFallback, escapeRegex } from "../support/ui-actions";

export class LeadReportsPage {
  constructor(private readonly page: Page) {}

  get engagementModuleButton() {
    return this.page
      .locator("button")
      .filter({
        has: this.page.locator('img[alt*="engagement" i], img[alt*="Engagement" i]'),
      })
      .first();
  }

  get leadReportsTab() {
    return this.page.getByRole("tab", { name: "Lead Reports" }).first();
  }

  async open(app: LeadListAppConfig) {
    await new LeadListPage(this.page).gotoManageConstruction(app);
    await expect(this.engagementModuleButton).toBeVisible({ timeout: 60000 });
    await clickWithFallback(
      this.engagementModuleButton,
      this.page,
      async () => await this.leadReportsTab.isVisible().catch(() => false),
      { force: true },
    );
    await this.selectLeadReportsTab();
    await this.page.waitForLoadState("networkidle").catch(() => {});
  }

  async selectAllProjects() {
    await new ProjectSwitcherPage(this.page).ensureActiveProject("All Projects");
    await this.selectLeadReportsTab(true);
    await this.waitForReportsReady();
  }

  async expectReportsLoaded() {
    await this.waitForReportsReady();

    for (const widgetTitle of [
      "Executive Performance &",
      "Source wise Lead Stage Funnel",
      "Current Lead Status Overview",
      "Executive wise Lead Status",
      "Source wise Site Visit Done",
      "Executive wise Site Visit",
      "Source wise Booking Trend",
    ]) {
      await expect(this.reportWidget(widgetTitle)).toBeVisible({ timeout: 60000 });
    }

    await expect(this.page.getByRole("button", { name: "Today" })).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole("button", { name: "Download" }).first()).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole("button", { name: "View All" })).toBeVisible({ timeout: 30000 });
  }

  async applyPresetDateRange(optionName: string, dateRangeControlIndex = 0) {
    await this.openDateRangeMenu(dateRangeControlIndex);
    await this.selectDateRangeOption(optionName);
    await this.waitForReportsReady();
    await expect(this.dateRangeButton(optionName).first()).toBeVisible({ timeout: 30000 });
  }

  async applyCustomDateRangeOnReport(dateRangeControlIndex = 1) {
    await this.openDateRangeMenu(dateRangeControlIndex);
    await this.selectDateRangeOption("Custom");

    const calendarDays = this.page
      .getByRole("button", { name: /^\d{1,2}$/ })
      .filter({ hasNotText: /^(29|30|31)$/ });

    await expect(calendarDays.first()).toBeVisible({ timeout: 15000 });
    const firstDay = calendarDays.nth(1);
    const secondDay = calendarDays.nth(3);

    await firstDay.click({ force: true });
    await secondDay.click({ force: true });
    await this.page.getByRole("button", { name: /^Apply$/ }).click({ force: true });
    await this.waitForReportsReady();
  }

  async expectReportDataVisibleAfterDateFilter(expectedWidgetTitle: string) {
    await expect(this.reportWidget(expectedWidgetTitle)).toBeVisible({ timeout: 60000 });
    await expect
      .poll(async () => await this.visibleReportDataCount(), { timeout: 60000 })
      .toBeGreaterThan(0);
  }

  async downloadFirstReportPdf() {
    await this.openDownloadMenu(this.page.getByRole("button", { name: "Download" }).first());
    return await this.downloadPdfFromOpenMenu();
  }

  async downloadVisibleReportPdf(reportIndex = 0) {
    const downloadButtons = this.page.getByRole("button", { name: "Download" });
    await this.openDownloadMenu(downloadButtons.nth(reportIndex));
    return await this.downloadPdfFromOpenMenu();
  }

  async expectPdfDownload(download: Download) {
    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename, "Downloaded report should be a PDF file").toMatch(/\.pdf$/i);
    await expect
      .poll(async () => Boolean(await download.path().catch(() => null)), { timeout: 30000 })
      .toBeTruthy();
  }

  private reportWidget(title: string) {
    return this.page.getByText(new RegExp(escapeRegex(title), "i")).first();
  }

  private dateRangeButton(optionName: string) {
    return this.page.getByRole("button", { name: new RegExp(`^${escapeRegex(optionName)}$`, "i") });
  }

  private async openDateRangeMenu(dateRangeControlIndex: number) {
    const dateRangeButton = this.page
      .getByRole("button", { name: /^(Today|Last 7 Days|Last 30 Days|WTD|MTD|Custom)$/i })
      .nth(dateRangeControlIndex);

    await expect(dateRangeButton).toBeVisible({ timeout: 30000 });
    await clickWithFallback(
      dateRangeButton,
      this.page,
      async () => await this.page.getByRole("menuitem", { name: /^(Today|Last 7 Days|Last 30 Days|WTD|MTD|Custom)$/i }).first().isVisible().catch(() => false),
      { force: true },
    );
  }

  private async selectDateRangeOption(optionName: string) {
    const option = this.page.getByRole("menuitem", {
      name: new RegExp(`^${escapeRegex(optionName)}$`, "i"),
    });

    await expect(option).toBeVisible({ timeout: 15000 });
    await option.click({ force: true });
  }

  private async openDownloadMenu(downloadButton: Locator) {
    await expect(downloadButton).toBeVisible({ timeout: 30000 });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await clickWithFallback(
        downloadButton,
        this.page,
        async () => await this.downloadPdfOption().isVisible().catch(() => false),
        { force: true },
      );

      if (await this.downloadPdfOption().isVisible().catch(() => false)) {
        return;
      }

      await this.page.waitForTimeout(500);
    }

    await expect(this.downloadPdfOption()).toBeVisible({ timeout: 5000 });
  }

  private async downloadPdfFromOpenMenu() {
    const downloadPromise = this.page.waitForEvent("download", { timeout: 60000 });
    await expect(this.downloadPdfOption()).toBeVisible({ timeout: 10000 });
    await this.downloadPdfOption().click({ force: true });
    return await downloadPromise;
  }

  private downloadPdfOption() {
    return this.page.getByRole("button", { name: /Download PDF/i }).first();
  }

  private async visibleReportDataCount() {
    return await this.page
      .locator("svg, canvas, table, [role='table'], [class*='recharts']")
      .evaluateAll((elements) =>
        elements.filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        }).length,
      )
      .catch(() => 0);
  }

  private async waitForReportsReady() {
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await expect
      .poll(async () => await this.reportWidget("Executive Performance &").isVisible().catch(() => false), {
        timeout: 60000,
      })
      .toBeTruthy();
  }

  private async selectLeadReportsTab(expectReportContent = false) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await this.leadReportsTab.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1000);

      const selected = await this.leadReportsTabSelected();
      const contentVisible = await this.reportWidget("Executive Performance &").isVisible().catch(() => false);
      if ((expectReportContent && contentVisible) || (!expectReportContent && selected)) {
        return;
      }
    }

    if (expectReportContent) {
      await expect(this.reportWidget("Executive Performance &")).toBeVisible({ timeout: 30000 });
      return;
    }

    await expect
      .poll(async () => await this.leadReportsTabSelected(), { timeout: 15000 })
      .toBeTruthy();
  }

  private async leadReportsTabSelected() {
    const selected = await this.leadReportsTab.getAttribute("aria-selected").catch(() => null);

    return selected === "true";
  }
}
