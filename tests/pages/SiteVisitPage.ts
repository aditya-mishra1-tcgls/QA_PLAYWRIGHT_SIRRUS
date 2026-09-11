import { expect, type Page } from "@playwright/test";
import siteVisitFlowConfig from "../data/site-visit-flow.json";
import { ensureAuthenticatedSession } from "../support/session";
import { clickWithFallback } from "../support/ui-actions";

export type SiteVisitAppConfig = {
  envName: string;
  baseUrl?: string;
  mobileNumber?: string;
  otp?: string;
};

export class SiteVisitPage {
  constructor(private readonly page: Page) {}

  getSiteVisitConfig(envName: string) {
    const config = siteVisitFlowConfig[envName as keyof typeof siteVisitFlowConfig];
    if (!config) {
      throw new Error(`Missing site visit seed data for "${envName}" in tests/data/site-visit-flow.json.`);
    }

    return config;
  }

  async openLeadDetail(detailPath: string, app?: SiteVisitAppConfig) {
    const normalizedDetailPath = this.normalizeLeadDetailPath(detailPath);

    if (app) {
      await ensureAuthenticatedSession(this.page, app, "/admin/developer/cpms/manage-construction");
    }

    await this.page.goto(normalizedDetailPath, { waitUntil: "networkidle" });

    if (app) {
      await ensureAuthenticatedSession(this.page, app, normalizedDetailPath);
    }

    await expect
      .poll(async () => {
        const bodyText = await this.page.locator("body").innerText().catch(() => "");
        return /Lead Profile|Lead ID\s*:|Change Stage|Lead Journey/i.test(bodyText);
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  async openChangeStage() {
    const stagePanelContent = this.page.locator("body");

    await clickWithFallback(
      this.page.getByText("Change Stage", { exact: true }).first(),
      this.page,
      async () => {
        const bodyText = await stagePanelContent.innerText().catch(() => "");
        return /Status|Open|Qualified|Site Visit|Opportunity|Booked|Dropped/i.test(bodyText);
      },
      { force: true }
    );

    await expect
      .poll(async () => {
        const bodyText = await stagePanelContent.innerText().catch(() => "");
        return /Status|Open|Qualified|Site Visit|Opportunity|Booked|Dropped/i.test(bodyText);
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  async assertScheduledLead(app: SiteVisitAppConfig) {
    const config = this.getSiteVisitConfig(app.envName);
    await this.openLeadDetail(config.scheduledLead.detailPath, app);

    await expect(this.page.locator("body")).toContainText(/Lead ID\s*:\s*L\d+/i);
    const bodyText = await this.page.locator("body").innerText();
    expect(bodyText).toContain("Lead Profile");
    expect(bodyText).toContain("Change Stage");

    await this.openChangeStage();
    await expect(this.page.getByRole("button", { name: /^site visit$/i })).toBeVisible();
  }

  async assertCompletedLead(app: SiteVisitAppConfig) {
    const config = this.getSiteVisitConfig(app.envName);
    await this.openLeadDetail(config.completedLead.detailPath, app);

    await expect(this.page.getByText(`Lead ID : ${config.completedLead.leadId}`, { exact: true })).toBeVisible();
    const bodyText = await this.page.locator("body").innerText();
    expect(bodyText).toContain("Visit Done");
    await expect(this.page.getByText("Site Visit Scheduled :", { exact: true })).toBeVisible();

    await this.openChangeStage();
    await expect(this.page.getByText("Site Visit Completed", { exact: true })).toBeVisible();
    await expect(this.page.getByText("Visit Start :", { exact: true })).toBeVisible();
    await expect(this.page.getByText("Visit End :", { exact: true })).toBeVisible();
    await expect(this.page.getByText("Total Duration:", { exact: true })).toBeVisible();
  }

  async assertHistory(app: SiteVisitAppConfig) {
    const config = this.getSiteVisitConfig(app.envName);
    await this.openLeadDetail(config.revisitLead.detailPath, app);

    await expect(this.page.getByText(`Lead ID : ${config.revisitLead.leadId}`, { exact: true })).toBeVisible();
    await expect(this.page.getByText(/Lead Status History/i)).toBeVisible();

    const bodyText = await this.page.locator("body").innerText();
    expect(bodyText).toContain("Scheduled");
    expect(bodyText).toContain("In Progress");
    expect(bodyText).toContain("Visit Done");
    expect(bodyText).toContain("Revisit");
  }

  private normalizeLeadDetailPath(detailPath: string) {
    return detailPath.replace(/\/manage-leads\?/, "/manage-leads/?");
  }
}
