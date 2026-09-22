import { expect, type Page } from "@playwright/test";
import { ensureAuthenticatedSession } from "../support/session";
import { clickWithFallback, fillWithFallback, tryClickFirstVisible } from "../support/ui-actions";
import { ProjectSwitcherPage } from "./ProjectSwitcherPage";

export type MartechAppConfig = {
  baseUrl?: string;
  martechBaseUrl?: string;
  mobileNumber?: string;
  otp?: string;
};

export type OneTimeCampaignChannel = "SMS" | "WhatsApp" | "RCS" | "AI Calling";

export class MartechSegmentsPage {
  private currentApp?: MartechAppConfig;
  private currentManageConstructionUrl?: string;

  constructor(private readonly page: Page) {}

  get marketingPulseButton() {
    return this.page
      .locator("button")
      .filter({
        has: this.page.locator('img[alt*="marketing" i], img[alt*="Marketing" i]'),
      })
      .first();
  }

  async openActiveLeadCampaigns(app: MartechAppConfig) {
    const baseUrl = app.martechBaseUrl || app.baseUrl;
    const martechApp = { ...app, baseUrl };
    const manageConstructionUrl = new URL("/admin/developer/cpms/manage-construction", baseUrl).toString();
    this.currentApp = martechApp;
    this.currentManageConstructionUrl = manageConstructionUrl;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.page.goto(manageConstructionUrl, { waitUntil: "domcontentloaded" });
      await ensureAuthenticatedSession(this.page, martechApp, manageConstructionUrl);

      if (await this.page.getByRole("textbox", { name: /Enter Mobile Number/i }).isVisible().catch(() => false)) {
        continue;
      }

      await expect(this.marketingPulseButton).toBeVisible({ timeout: 60000 });
      await clickWithFallback(
        this.marketingPulseButton,
        this.page,
        async () => await this.activeLeadsCampaignsLink().isVisible().catch(() => false),
        { force: true },
      );

      const activeLeadsCampaigns = this.activeLeadsCampaignsLink();
      if (!await activeLeadsCampaigns.isVisible().catch(() => false)) {
        await this.marketingPulseButton.click({ force: true }).catch(() => {});
      }

      if (await activeLeadsCampaigns.isVisible({ timeout: 10000 }).catch(() => false)) {
        const activeLeadsHref = await activeLeadsCampaigns.getAttribute("href").catch(() => null);
        await clickWithFallback(
          activeLeadsCampaigns,
          this.page,
          async () => await this.page.getByText(/Upload a CSV|One Time/i).first().isVisible().catch(() => false),
          { force: true },
        );
        if (await this.activeLeadsCampaignsLoaded()) {
          return;
        }
        if (activeLeadsHref && await this.openActiveLeadCampaignsUrl(baseUrl, activeLeadsHref)) {
          return;
        }
      }

      await this.clickActiveLeadsCampaignsCard();
      if (await this.activeLeadsCampaignsLoaded()) {
        return;
      }

      if (await this.openActiveLeadCampaignsUrl(baseUrl, "/admin/developer/segments?tab=0")) {
        return;
      }
    }

    throw new Error("Unable to open Active Leads Campaigns from Marketing Pulse.");
  }

  private async openActiveLeadCampaignsUrl(baseUrl: string | undefined, href: string) {
    if (!baseUrl) {
      return false;
    }

    await this.page.goto(new URL(href, baseUrl).toString(), { waitUntil: "domcontentloaded" }).catch(() => {});
    return await this.activeLeadsCampaignsLoaded();
  }

  private activeLeadsCampaignsLink() {
    return this.page
      .locator("a, [role='link'], button")
      .filter({ hasText: /Active Leads Campaigns/i })
      .first();
  }

  private async activeLeadsCampaignsLoaded() {
    return await expect
      .poll(
        async () => await this.page.getByText(/Upload a CSV|One Time|Create Campaign|Segment Search/i).first().isVisible().catch(() => false),
        { timeout: 15000 },
      )
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
  }

  private async clickActiveLeadsCampaignsCard() {
    const card = this.page
      .locator("div")
      .filter({ has: this.page.getByText(/Active Leads Campaigns/i) })
      .filter({ has: this.page.getByText(/Engage and nurture/i) })
      .first();

    if (await card.isVisible().catch(() => false)) {
      const box = await card.boundingBox().catch(() => null);
      if (box) {
        await this.page.mouse.click(box.x + box.width - 28, box.y + 32);
        return;
      }

      await card.click({ force: true }).catch(() => {});
      return;
    }

    await tryClickFirstVisible([
      this.page.getByText(/Active Leads Campaigns/i).first(),
    ], { force: true });
  }

  async createPhoneSegmentFromCsv(segmentName: string, csvPath: string) {
    await this.openCsvUploadForm();

    const nameInput = this.page.getByRole("textbox", { name: /High_Value_Prospects/i }).first();
    await expect(nameInput).toBeVisible({ timeout: 60000 });
    await fillWithFallback(nameInput, segmentName);

    const descriptionInput = this.page.getByRole("textbox", { name: /Project with swimming pool/i }).first();
    if (await descriptionInput.isVisible().catch(() => false)) {
      await fillWithFallback(descriptionInput, segmentName);
    }

    const fileInput = this.page.locator('input[type="file"]').first();
    await expect(fileInput).toHaveCount(1, { timeout: 30000 });
    await fileInput.setInputFiles(csvPath);

    await this.selectDropdownOption(/Select Attribute Type/i, /^phone$/i);
    await this.selectDropdownOption(/Select Data Type/i, /^string$/i);

    await expect(this.page.getByRole("button", { name: /^Cancel$/i })).toBeVisible({ timeout: 30000 });
    const createButton = this.page.getByRole("button", { name: /^Create$/i }).first();
    await expect(createButton).toBeVisible({ timeout: 30000 });
    await expect(createButton).toBeEnabled({ timeout: 30000 });
    await createButton.click({ force: true });

    await expect
      .poll(async () => {
        const bodyText = await this.page.locator("body").innerText().catch(() => "");
        return /View All Segments|Segment Details|created|success/i.test(bodyText);
      }, { timeout: 90000 })
      .toBeTruthy();
  }

  async openCreatedSegmentDetails(segmentName: string) {
    await this.openAllSegments();
    await this.searchSegment(segmentName);

    const segmentResult = this.page.getByText(new RegExp(this.escapeRegex(segmentName), "i")).last();
    await expect(segmentResult).toBeVisible({ timeout: 60000 });
    await segmentResult.click({ force: true });

    await tryClickFirstVisible([
      this.page.getByRole("img", { name: /View Leads/i }),
      this.page.getByRole("button", { name: /View Leads/i }),
      this.page.locator('img[alt*="View Leads" i]').first(),
    ], { force: true });

    await expect(this.page.getByRole("button", { name: /Create Campaign/i })).toBeVisible({ timeout: 60000 });
    await expect(this.page.locator("body")).toContainText(new RegExp(this.escapeRegex(segmentName), "i"), {
      timeout: 60000,
    });

    for (const label of ["Segment Details", "Reachability Summary", "Reachability by Channel"]) {
      await expect(this.page.locator("body")).toContainText(label, { timeout: 60000 });
    }
  }

  async createAndPublishSendNowCampaign(channel: OneTimeCampaignChannel, campaignName: string) {
    const campaignNameInput = this.page.getByRole("textbox", { name: /PreLaunch_Offer_Campaign/i }).first();
    await this.openCampaignSetupForm(campaignNameInput);
    await fillWithFallback(campaignNameInput, campaignName);

    await this.selectCampaignChannel(channel);
    await this.refreshCampaignAudienceCount();
    await this.openCampaignContentSetup();
    await this.configureCampaignContent(channel);
    await this.selectSendNowDelivery();
    await this.publishCampaign();
    await this.verifyCampaignCreated(campaignName);
  }

  async createAndPublishSmsCampaignUsingExistingPhoneSegment(campaignName: string) {
    await this.openOneTimeCampaignsTab();

    const campaignNameInput = this.page.getByRole("textbox", { name: /PreLaunch_Offer_Campaign/i }).first();
    await this.openCampaignSetupForm(campaignNameInput);
    await this.selectCampaignChannel("SMS");
    await fillWithFallback(campaignNameInput, campaignName);

    await this.selectReachablePhoneSegment();
    await this.refreshCampaignAudienceCount();
    await this.openCampaignContentSetup();
    await this.configureCampaignContent("SMS");
    await this.selectSendNowDelivery();
    await this.publishCampaign();
    await this.page.waitForTimeout(60000);
    await this.reloadCampaignListing();
    await this.verifyCampaignCreated(campaignName);
  }

  async verifySmsCampaignListingPerformanceMatrix(campaignName: string) {
    await this.page.waitForTimeout(60000);
    await this.reloadCampaignListing();
    await this.searchCampaign(campaignName);
    await this.waitForCampaignPerformanceReadiness(campaignName);

    const campaignRow = this.campaignRow(campaignName);
    await expect(campaignRow).toBeVisible({ timeout: 60000 });
    const rowText = await campaignRow.innerText().catch(() => "");
    if (/Scheduled/i.test(rowText)) {
      throw new Error(
        `Campaign "${campaignName}" is still Scheduled, so the performance matrix is not available for this row. Row text: ${rowText}`,
      );
    }
    await this.expandCampaignPerformanceMatrix(campaignName);

    for (const label of [/Sent Count/i, /Delivered Count/i, /Click Count/i]) {
      await expect(this.page.getByText(label).first()).toBeVisible({ timeout: 30000 });
    }

    await expect(this.page.locator(".recharts-surface").first()).toBeVisible({ timeout: 30000 });
  }

  private async waitForCampaignPerformanceReadiness(campaignName: string) {
    let lastRowText = "";

    await expect
      .poll(
        async () => {
          await this.reloadCampaignListing();
          await this.searchCampaign(campaignName);

          const campaignRow = this.campaignRow(campaignName);
          await campaignRow.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
          lastRowText = await campaignRow.innerText().catch(() => "");
          return !/Scheduled/i.test(lastRowText);
        },
        {
          intervals: [15000, 15000, 30000, 30000, 30000],
          message: `Campaign "${campaignName}" should leave Scheduled state before opening performance matrix. Last row text: ${lastRowText}`,
          timeout: 150000,
        },
      )
      .toBeTruthy();
  }

  async openCampaignAnalyticsPage(campaignName: string) {
    await this.searchCampaign(campaignName);
    const campaignLink = this.page.getByText(new RegExp(`^${this.escapeRegex(campaignName)}$`, "i")).first();
    await expect(campaignLink).toBeVisible({ timeout: 60000 });

    const popupPromise = this.page.waitForEvent("popup");
    await campaignLink.click({ force: true });
    const campaignPage = await popupPromise;
    await campaignPage.waitForLoadState("domcontentloaded").catch(() => {});
    return campaignPage;
  }

  async verifySmsCampaignAnalyticsAndPreview(campaignPage: Page, campaignName: string) {
    await expect(campaignPage.getByRole("heading", { name: new RegExp(this.escapeRegex(campaignName), "i") }))
      .toBeVisible({ timeout: 60000 });
    await expect(campaignPage.locator("body")).toContainText(/SMS/i, { timeout: 30000 });

    for (const label of [/Created By/i, /Created On/i, /Status/i]) {
      await expect(campaignPage.getByText(label).first()).toBeVisible({ timeout: 30000 });
    }

    const refreshButton = campaignPage.getByRole("button", { name: /^Refresh$/i }).first();
    await expect(refreshButton).toBeVisible({ timeout: 30000 });
    await refreshButton.click({ force: true });
    await campaignPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await expect
      .poll(async () => {
        const bodyText = await campaignPage.locator("body").innerText().catch(() => "");
        return /Attempted|Sent|Delivered|Clicks|Campaign Delivery Funnel|Key Performance Metrics/i.test(bodyText);
      }, { timeout: 30000 })
      .toBeTruthy();

    for (const metric of [/Attempted/i, /Sent/i, /Delivered/i, /Clicks/i]) {
      await expect(campaignPage.getByText(metric).first()).toBeVisible({ timeout: 30000 });
    }

    for (const heading of [/Campaign Delivery Funnel/i, /Error Breakdown/i, /Key Performance Metrics/i]) {
      await expect(campaignPage.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 30000 });
    }

    await campaignPage.getByRole("button", { name: /Preview/i }).click({ force: true });
    await expect(campaignPage.getByRole("heading", { name: /Segmentation/i }).first()).toBeVisible({ timeout: 30000 });
    await expect(campaignPage.getByText(/Message Preview/i).first()).toBeVisible({ timeout: 30000 });
    await expect(campaignPage.getByRole("heading", { name: /Delivery Controls/i }).first()).toBeVisible({ timeout: 30000 });
    await expect(campaignPage.locator("div").filter({ hasText: /^Timing$/ }).first()).toBeVisible({ timeout: 30000 });
    await expect(campaignPage.locator("div").filter({ hasText: /^Channel Details$/ }).first()).toBeVisible({
      timeout: 30000,
    });
  }

  async createAndPublishAiCallingCampaign(campaignName: string) {
    await new ProjectSwitcherPage(this.page).ensureActiveProject(
      process.env.MARTECH_AI_CALLING_PROJECT_NAME || "Parth lakefront",
    );
    await this.openOneTimeCampaignsTab();

    const campaignNameInput = this.page.getByRole("textbox", { name: /PreLaunch_Offer_Campaign/i }).first();
    await this.openCampaignSetupForm(campaignNameInput);
    await this.selectCampaignChannel("AI Calling");
    await fillWithFallback(campaignNameInput, campaignName);

    await this.selectReachablePhoneSegment();
    await this.refreshCampaignAudienceCount();
    await this.openCampaignContentSetup();
    await this.configureCampaignContent("AI Calling");
    await this.selectCallNowDelivery();
    await this.publishCampaign();
    await this.verifyCampaignCreated(campaignName);
  }

  async configureSmsContentForOpenBuilder() {
    await this.configureChannelContentForOpenBuilder("SMS");
  }

  async configureChannelContentForOpenBuilder(channel: OneTimeCampaignChannel) {
    if (channel === "WhatsApp") {
      await this.configureWhatsAppContent();
      await this.saveOpenBuilderContent();
      return;
    }

    if (channel === "AI Calling") {
      await this.configureAiCallingContent();
      await this.saveOpenBuilderContent();
      return;
    }

    await this.selectSmsSender();

    await this.fillFirstVisibleAndVerifyIfShown([
      this.page.getByRole("textbox", { name: /Enter DLT Template ID/i }).first(),
      this.page.getByPlaceholder(/Enter DLT Template ID/i).first(),
      this.page.locator('input[placeholder*="DLT Template ID" i], textarea[placeholder*="DLT Template ID" i]').first(),
    ], "1107171337677062911");

    await this.fillFirstVisibleAndVerifyIfShown([
      this.page.getByRole("textbox", { name: /Write your message here/i }).first(),
      this.page.getByPlaceholder(/Write your message here/i).first(),
      this.page.locator('textarea[placeholder*="Write your message" i], input[placeholder*="Write your message" i]').first(),
    ], "Hi {{name}}, Hope you are having a great experience with Ziki. To share feedback: here Thanks, Ziki");

    await this.fillFirstVisibleAndVerifyIfShown([
      this.page.getByRole("textbox", { name: /Enter a phone number to receive the test/i }).first(),
      this.page.getByPlaceholder(/Enter a phone number to receive/i).first(),
      this.page.locator('input[placeholder*="phone number" i], textarea[placeholder*="phone number" i]').first(),
    ], "8655433491");

    await this.saveContentVariablesIfShown(true);
    await this.sendTestMessageIfRequired();
    await this.saveOpenBuilderContent();
  }

  async createRuleBasedUserActionSegment(segmentName: string) {
    await this.openRuleBasedSegmentForm();

    const segmentNameInput = this.page.getByRole("textbox", { name: /High_Value_Prospects/i }).first();
    await expect(segmentNameInput).toBeVisible({ timeout: 60000 });
    await fillWithFallback(segmentNameInput, segmentName);

    await this.selectDropdownOption(/^Lead$/i, /^Lead$/i);

    await this.fillRuleSegmentDescription("Rule based user action segment created by automation");

    await this.selectRuleDropdown(/^User Action$/i, /^Has Executed$/i);
    await this.selectRuleDropdown(/^Has Executed$/i, /^has executed$/);
    await this.selectRuleDropdown(/^Event$/i, /^Lead Created$/i);
    await this.selectRuleDropdown(/^At Least$/i, /^at least$/);
    await this.fillRuleValueInput(0, "1");
    await this.selectRuleDropdown(/^In Last$/i, /^In Last$/i);
    await this.fillRuleValueInput(1, "10");
    await this.selectRuleDropdown(/^Days$/i, /^days$/);
    await this.refreshRuleBasedSegmentCount();

    const createButton = this.page.getByRole("button", { name: /^Create$/i }).first();
    await expect(createButton).toBeEnabled({ timeout: 60000 });
    await createButton.click({ force: true });

    await this.expectRuleBasedSegmentVisible(segmentName);
  }

  async createRuleBasedEngagementHistorySegment(segmentName: string) {
    await this.openRuleBasedSegmentForm();

    const segmentNameInput = this.page.getByRole("textbox", { name: /High_Value_Prospects/i }).first();
    await expect(segmentNameInput).toBeVisible({ timeout: 60000 });
    await fillWithFallback(segmentNameInput, segmentName);

    await this.fillRuleSegmentDescription("Rule based engagement history segment created by automation");

    await this.selectRuleCategory(/^Engagement History$/i);
    await this.selectRuleDropdown(/^Has Executed$/i, /^has executed$/);
    await this.selectRuleDropdown(/^Event$/i, /^Whatsapp Sent$/i);
    await this.selectRuleDropdown(/^At Least$/i, /^at least$/);
    await this.fillRuleValueInput(0, "1");
    await this.selectRuleDropdown(/^In Last$/i, /^In Last$/i);
    await this.fillRuleValueInput(1, "20");
    await this.selectRuleDropdown(/^Days$/i, /^days$/);
    await this.refreshRuleBasedSegmentCount();

    const createButton = this.page.getByRole("button", { name: /^Create$/i }).first();
    await expect(createButton).toBeEnabled({ timeout: 60000 });
    await createButton.click({ force: true });
    await expect(this.page.getByText(/Rule Based Segment Created/i).first()).toBeVisible({ timeout: 60000 });

    await this.expectRuleBasedSegmentVisible(segmentName);
  }

  async expectRuleBasedSegmentVisible(segmentName: string) {
    await this.openAllSegments();
    await this.openRuleBasedSegmentsTab();
    await this.searchSegment(segmentName, async () => {
      await this.openAllSegments();
      await this.openRuleBasedSegmentsTab();
    });
    await expect(this.page.getByText(new RegExp(this.escapeRegex(segmentName), "i")).first()).toBeVisible({
      timeout: 60000,
    });
  }

  private async openCampaignSetupForm(campaignNameInput: ReturnType<Page["locator"]>) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const createCampaignButton = this.page.getByRole("button", { name: /Create Campaign/i }).first();
      await expect(createCampaignButton).toBeVisible({ timeout: 60000 });
      await createCampaignButton.click({ force: true });

      const opened = await campaignNameInput
        .waitFor({ state: "visible", timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      if (opened) {
        return;
      }

      await this.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await this.page.waitForTimeout(3000);
    }

    await expect(campaignNameInput).toBeVisible({ timeout: 60000 });
  }

  private async openCsvUploadForm() {
    await this.openOneTimeCampaignsTab();

    const uploadCsv = this.page.getByText(/Upload a CSV/i).first();
    await expect(uploadCsv).toBeVisible({ timeout: 60000 });
    await uploadCsv.click({ force: true });
  }

  private async openRuleBasedSegmentForm() {
    await this.openOneTimeCampaignsTab();

    const createWithRules = this.page.getByText(/Create with Rules/i).first();
    await expect(createWithRules).toBeVisible({ timeout: 60000 });
    await createWithRules.click({ force: true });
  }

  private async openOneTimeCampaignsTab() {
    await tryClickFirstVisible([
      this.page.getByRole("button", { name: /One Time/i }),
      this.page.getByText(/One Time/i).first(),
    ], { force: true });
  }

  private async selectCampaignChannel(channel: OneTimeCampaignChannel) {
    const channelPattern = channel === "SMS"
      ? /SMS/i
      : channel === "RCS"
        ? /RCS/i
        : channel === "AI Calling"
          ? /AI Calling/i
          : /WhatsApp|Whatsapp/i;
    await tryClickFirstVisible([
      this.page.getByRole("button", { name: new RegExp(`icon\\s*${channelPattern.source}`, "i") }),
      this.page.getByRole("button", { name: channelPattern }).first(),
      this.page.getByText(channelPattern).locator("xpath=ancestor::button[1]").first(),
      this.page.getByText(channelPattern).first(),
    ], { force: true });

    await expect(this.page.locator("body")).toContainText(channelPattern, { timeout: 30000 });
  }

  private async refreshCampaignAudienceCount() {
    await tryClickFirstVisible([
      this.page.getByText(/^Refresh Count$/i).locator("xpath=ancestor::button[1]").first(),
      this.page.getByText(/^Refresh Count$/i).first(),
    ], { force: true });
  }

  private async refreshRuleBasedSegmentCount() {
    await this.page.keyboard.press("Tab").catch(() => {});
    await this.page.waitForTimeout(500);

    const getCountActions = [
      this.page.locator("button").filter({ hasText: /^Get Count$/i }).first(),
      this.page.getByRole("button", { name: /^Get Count$/i }).first(),
      this.page.getByText(/^Get Count$/i).locator("xpath=ancestor::*[self::button or self::div][1]").first(),
      this.page.getByText(/^Get Count$/i).first(),
      this.page.locator("button").filter({ hasText: /^Get Count$/i }).last(),
      this.page.getByRole("button", { name: /^Get Count$/i }).last(),
      this.page.getByText(/^Get Count$/i).locator("xpath=ancestor::*[self::button or self::div][1]").last(),
      this.page.getByText(/^Get Count$/i).last(),
    ];

    for (const action of getCountActions) {
      if (!await action.isVisible().catch(() => false)) {
        continue;
      }

      await action.scrollIntoViewIfNeeded().catch(() => {});
      await action.click({ force: true }).catch(async () => {
        await action.evaluate((element) => (element as HTMLElement).click()).catch(() => {});
      });
      await this.page.waitForTimeout(1500);

      const countFetched = await this.page
        .getByText(/No count fetched yet/i)
        .first()
        .isHidden({ timeout: 3000 })
        .catch(() => false);
      if (countFetched) {
        break;
      }
    }

    await expect
      .poll(async () => {
        const bodyText = await this.page.locator("body").innerText().catch(() => "");
        const createEnabled = await this.page.getByRole("button", { name: /^Create$/i }).first().isEnabled().catch(() => false);
        return !/No count fetched yet/i.test(bodyText) || createEnabled;
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  private async openCampaignContentSetup() {
    const opened = await tryClickFirstVisible([
      this.page.getByRole("button", { name: /Set up Content/i }).first(),
      this.page.getByText(/Set up Content/i).locator("xpath=ancestor::button[1]").first(),
      this.page.getByText(/Set up Content/i).first(),
    ], { force: true });

    if (!opened) {
      throw new Error("Unable to open campaign content setup.");
    }

    await expect
      .poll(async () => {
        const contentControls = [
          this.page.getByRole("button", { name: /Select a Sender Name/i }).first(),
          this.page.getByRole("button", { name: /Select the scenario/i }).first(),
          this.page.getByRole("textbox", { name: /Write your message here/i }).first(),
          this.page.getByRole("textbox", { name: /Enter DLT Template ID/i }).first(),
          this.page.getByRole("button", { name: /^Save$/i }).first(),
          this.page.getByRole("button", { name: /icon Save|Save/i }).first(),
        ];
        const visibility = await Promise.all(contentControls.map((control) => control.isVisible().catch(() => false)));
        return visibility.some(Boolean);
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  private async configureCampaignContent(channel: OneTimeCampaignChannel) {
    if (channel === "WhatsApp") {
      await this.configureWhatsAppContent();
      await this.saveCampaignContent();
      return;
    }

    if (channel === "RCS") {
      await this.configureRcsContent();
      await this.saveCampaignContent();
      return;
    }

    if (channel === "AI Calling") {
      await this.configureAiCallingContent();
      await this.saveCampaignContent();
      return;
    }

    await this.selectSmsSender();

    await this.fillFirstVisibleAndVerifyIfShown([
      this.page.getByRole("textbox", { name: /Enter DLT Template ID/i }).first(),
      this.page.getByPlaceholder(/Enter DLT Template ID/i).first(),
      this.page.locator('input[placeholder*="DLT Template ID" i], textarea[placeholder*="DLT Template ID" i]').first(),
    ], "1107171337677062911");

    const message =
      channel === "SMS"
        ? "Hi {{name}}, Hope you are having a great experience with Ziki. To share feedback: here Thanks, Ziki"
        : "Hi, Hope you are having a great experience with Ziki.";
    await this.fillFirstVisibleAndVerifyIfShown([
      this.page.getByRole("textbox", { name: /Write your message here/i }).first(),
      this.page.getByPlaceholder(/Write your message here/i).first(),
      this.page.locator('textarea[placeholder*="Write your message" i], input[placeholder*="Write your message" i]').first(),
    ], message);

    await this.fillFirstVisibleAndVerifyIfShown([
      this.page.getByRole("textbox", { name: /Enter a phone number to receive the test/i }).first(),
      this.page.getByPlaceholder(/Enter a phone number to receive/i).first(),
      this.page.locator('input[placeholder*="phone number" i], textarea[placeholder*="phone number" i]').first(),
    ], "8655433491");

    await this.saveContentVariablesIfShown(channel === "SMS");
    await this.sendTestMessageIfRequired();
    await this.saveCampaignContent();
  }

  private async saveCampaignContent() {
    const saveButton = this.page
      .getByRole("button", { name: /^(icon\s*)?Save$/i })
      .last();
    await expect(saveButton).toBeEnabled({ timeout: 30000 });
    await saveButton.click({ force: true });
    await this.page.waitForTimeout(1000);
    if (await this.page.getByText(/Set up Content -/i).first().isVisible().catch(() => false)) {
      await saveButton.evaluate((element) => (element as HTMLButtonElement).click()).catch(() => {});
    }

    await this.page.waitForTimeout(2000);
  }

  private async saveOpenBuilderContent() {
    const saveButton = this.page
      .getByRole("button", { name: /^(icon\s*)?Save$/i })
      .last();
    await expect(saveButton).toBeEnabled({ timeout: 30000 });
    await saveButton.scrollIntoViewIfNeeded().catch(() => {});
    await saveButton.click({ force: true });
    await this.page.waitForTimeout(2000);
  }

  private async configureWhatsAppContent() {
    await this.selectDropdownOption(/Select a Sender ID|Sender ID/i, /^siruss\.ai$/i);
    await this.selectDropdownOption(/Select a Template|Template/i, /^site_visit_confirmation$/i);

    await this.fillTemplateVariables(["patron", "test demo"]);
  }

  private async configureRcsContent() {
    await this.selectDropdownOption(/Select a Sender ID|Sender ID/i, /^rcs-karix-/i);
    await this.selectDropdownOptionWithSearch(/Select a Template|Template/i, "rcs");

    await this.fillTemplateVariables(["patron", "134131"]);
  }

  private async configureAiCallingContent() {
    await this.selectFirstAvailableAiCallingScenario();
    await expect(this.page.getByText(/Use case description/i)).toBeVisible({ timeout: 30000 });
  }

  private async fillTemplateVariables(values: string[]) {
    const variableInputs = this.page.getByRole("textbox", { name: /Type @ to begin/i });
    await expect(variableInputs.first()).toBeVisible({ timeout: 30000 });

    for (let index = 0; index < values.length; index += 1) {
      const input = variableInputs.nth(index);
      await expect(input).toBeVisible({ timeout: 30000 });
      await fillWithFallback(input, values[index]);
    }
  }

  private async sendTestMessageIfRequired() {
    const sendTestButton = this.page.getByRole("button", { name: /Send Test Message/i }).first();
    if (!await sendTestButton.isVisible().catch(() => false)) {
      return;
    }

    if (!await sendTestButton.isEnabled().catch(() => false)) {
      return;
    }

    await sendTestButton.click({ force: true }).catch(() => {});
    await this.page.waitForTimeout(2000);
  }

  private async selectSmsSenderIfShown() {
    const senderVisible = await this.page
      .getByText(/Select a Sender Name/i)
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    if (!senderVisible) {
      return;
    }

    await this.selectSmsSender();
  }

  private async selectSmsSender() {
    const senderTrigger = this.page.getByRole("button", { name: /Select a Sender Name|MYZIKI/i }).first();
    await expect(this.page.getByText(/Select a Sender Name|MYZIKI/i).first()).toBeVisible({ timeout: 30000 });

    if (!await this.page.getByRole("button", { name: /Select a Sender Name/i }).first().isVisible().catch(() => false)) {
      return;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await tryClickFirstVisible([
        senderTrigger,
        this.page.getByText(/Select a Sender Name/i).locator("xpath=ancestor::button[1]").first(),
        this.page.getByText(/Select a Sender Name/i).first(),
      ]);
      const option = this.page.getByRole("button", { name: /^MYZIKI$/i }).last();
      await expect(option).toBeVisible({ timeout: 10000 });
      await option.scrollIntoViewIfNeeded().catch(() => {});
      await option.click();

      const selected = await expect
        .poll(async () => {
          const selectPlaceholderVisible = await this.page
            .getByRole("button", { name: /Select a Sender Name/i })
            .first()
            .isVisible()
            .catch(() => false);
          const selectedSenderVisible = await this.page
            .locator("button")
            .filter({ hasText: /^MYZIKI$/i })
            .first()
            .isVisible()
            .catch(() => false);
          return selectedSenderVisible && !selectPlaceholderVisible;
        }, { timeout: 5000 })
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);
      if (selected) {
        return;
      }
    }

    throw new Error("Unable to select SMS sender MYZIKI.");
  }

  private async fillFirstVisibleAndVerifyIfShown(candidates: Array<ReturnType<Page["locator"]>>, value: string) {
    for (const candidate of candidates) {
      const target = candidate.first();
      if (!await target.isVisible().catch(() => false)) {
        continue;
      }

      await fillWithFallback(target, value);
      const hasValue = await target
        .evaluate((element, expectedValue) => {
          const input = element as HTMLInputElement | HTMLTextAreaElement;
          return input.value === expectedValue || input.textContent === expectedValue;
        }, value)
        .catch(() => false);
      if (!hasValue) {
        await target.fill(value, { force: true }).catch(() => {});
      }
      return true;
    }

    return false;
  }

  private async fillRuleValueInput(index: number, value: string) {
    const input = this.page.getByRole("textbox", { name: /Enter Value/i }).nth(index);
    await expect(input).toBeVisible({ timeout: 30000 });
    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.click({ force: true });
    await input.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
    await input.type(value, { delay: 50 });
    await expect(input).toHaveValue(value, { timeout: 10000 });
    await input.press("Tab").catch(() => {});
    await this.page.waitForTimeout(500);
  }

  private async fillRuleSegmentDescription(value: string) {
    const descriptionInput = this.page
      .locator('textarea[placeholder*="Briefly describe" i], input[placeholder*="Briefly describe" i]')
      .first()
      .or(this.page.getByRole("textbox", { name: /Briefly describe this segment/i }).first());
    await expect(descriptionInput).toBeVisible({ timeout: 30000 });
    await descriptionInput.scrollIntoViewIfNeeded().catch(() => {});
    await descriptionInput.click({ force: true });
    await descriptionInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
    await descriptionInput.type(value, { delay: 20 });
    await expect(descriptionInput).toHaveValue(value, { timeout: 10000 });
    await descriptionInput.press("Tab").catch(() => {});
  }

  private async selectRuleDropdown(triggerName: RegExp, optionName: RegExp) {
    const trigger = this.page.getByRole("button", { name: triggerName }).first();
    await expect(trigger).toBeVisible({ timeout: 30000 });
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    const triggerBox = await trigger.boundingBox().catch(() => null);
    await trigger.click({ force: true });

    await this.clickDropdownOptionExcludingTrigger(optionName, triggerBox);
    await this.closeOpenDropdown();
  }

  private async clickDropdownOptionExcludingTrigger(
    optionName: RegExp,
    triggerBox: { x: number; y: number; width: number; height: number } | null,
  ) {
    const options = this.page
      .locator("button, [role='button']")
      .filter({ hasText: optionName });
    await expect(options.first()).toBeVisible({ timeout: 30000 });

    const optionCount = await options.count();
    for (let index = 0; index < optionCount; index += 1) {
      const option = options.nth(index);
      if (!await option.isVisible().catch(() => false)) {
        continue;
      }

      const optionBox = await option.boundingBox().catch(() => null);
      const isTrigger =
        triggerBox && optionBox &&
        Math.abs(optionBox.x - triggerBox.x) < 2 &&
        Math.abs(optionBox.y - triggerBox.y) < 2 &&
        Math.abs(optionBox.width - triggerBox.width) < 2 &&
        Math.abs(optionBox.height - triggerBox.height) < 2;

      if (isTrigger) {
        continue;
      }

      await option.scrollIntoViewIfNeeded().catch(() => {});
      await option.click({ force: true });
      return;
    }

    await options.last().click({ force: true });
  }

  private async selectRuleCategory(optionName: RegExp) {
    const categoryPill = this.page
      .locator("button, [role='button']")
      .filter({ hasText: optionName })
      .first();
    if (await categoryPill.isVisible().catch(() => false)) {
      await categoryPill.scrollIntoViewIfNeeded().catch(() => {});
      await categoryPill.click({ force: true });
      await expect(this.page.getByRole("button", { name: /^Has Executed$/i }).first()).toBeVisible({
        timeout: 30000,
      });
      return;
    }

    await this.selectRuleDropdown(/User Action|Engagement History/i, optionName);
  }

  private async saveContentVariablesIfShown(required = false) {
    const variableInput = this.page
      .getByRole("textbox", { name: /Type @ to begin/i })
      .or(this.page.getByPlaceholder(/Type @ to begin/i))
      .first();
    const visible = await variableInput.isVisible({ timeout: required ? 15000 : 3000 }).catch(() => false);
    if (!visible) {
      if (required) {
        throw new Error("Personalization variable input was not visible for SMS content.");
      }
      return;
    }

    await variableInput.scrollIntoViewIfNeeded().catch(() => {});
    await variableInput.click({ force: true });
    await variableInput.fill("");
    await variableInput.type("@");
    await expect(this.page.getByText(/Add Personalization|Add Data personalisation/i).first()).toBeVisible({
      timeout: 10000,
    });
    await tryClickFirstVisible([
      this.page.getByRole("button", { name: /Select the attribute/i }).first(),
      this.page.getByText(/Select the attribute/i).locator("xpath=ancestor::button[1]").first(),
      this.page.getByText(/Select the attribute/i).locator("xpath=ancestor::div[contains(@class,'cursor-pointer')][1]").first(),
      this.page.getByText(/Select the attribute/i).first(),
    ], { force: true });
    await expect(this.page.getByText(/First Name/i).first()).toBeVisible({ timeout: 10000 });
    await tryClickFirstVisible([
      this.page.getByRole("button", { name: /First Name/i }).first(),
      this.page.getByText(/First Name/i).locator("xpath=ancestor::button[1]").first(),
      this.page.getByText(/First Name/i).first(),
    ], { force: true });
    const addClicked = await tryClickFirstVisible([
      this.page.getByRole("button", { name: /^Add$/i }).first(),
      this.page.getByText(/^Add$/i).locator("xpath=ancestor::button[1]").first(),
    ], { force: true });
    if (!addClicked) {
      throw new Error("Unable to add SMS personalization mapping.");
    }

    const saveVariables = this.page.getByRole("button", { name: /Save variables/i }).first();
    await expect(saveVariables).toBeEnabled({ timeout: 10000 });
    await tryClickFirstVisible([
      this.page.getByRole("button", { name: /Save variables/i }).first(),
      this.page.getByText(/Save variables/i).locator("xpath=ancestor::button[1]").first(),
    ], { force: true });

    await expect
      .poll(async () => {
        const value = await variableInput.inputValue().catch(() => "");
        const firstNameVisible = await this.page.getByText(/First Name/i).first().isVisible().catch(() => false);
        return /first name/i.test(value) || firstNameVisible;
      }, { timeout: 10000 })
      .toBeTruthy();
  }

  private async selectSendNowDelivery() {
    const isSelected = async () => {
      return await this.isSendNowDeliverySelected();
    };

    await this.clickSendNowDeliveryByDom();

    if (await expect.poll(isSelected, { timeout: 5000 }).toBeTruthy().then(() => true).catch(() => false)) {
      await expect(this.page.getByRole("button", { name: /^Publish$/i }).first()).toBeEnabled({ timeout: 30000 });
      return;
    }

    const clickCandidates = [
      this.page.getByText(/^Send Now$/i).locator("xpath=ancestor::*[self::label or self::button or self::div][1]").first(),
      this.page.getByLabel(/Send Now/i).first(),
      this.page.getByText(/^Send Now$/i).first(),
    ];

    for (const candidate of clickCandidates) {
      if (!await candidate.isVisible().catch(() => false)) {
        continue;
      }

      await candidate.scrollIntoViewIfNeeded().catch(() => {});
      await candidate.click({ force: true }).catch(async () => {
        await candidate.evaluate((element) => (element as HTMLElement).click()).catch(() => {});
      });

      const selected = await expect
        .poll(isSelected, { timeout: 5000 })
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);
      if (selected) {
        await expect(this.page.getByRole("button", { name: /^Publish$/i }).first()).toBeEnabled({ timeout: 30000 });
        return;
      }
    }

    const deliveryOptions = this.page.locator("#delivery_time");
    const optionCount = await deliveryOptions.count();
    for (let index = 0; index < optionCount; index += 1) {
      const deliveryOption = deliveryOptions.nth(index);
      if (!await deliveryOption.isVisible().catch(() => false)) {
        continue;
      }

      const optionText = await deliveryOption
        .locator("xpath=ancestor::*[self::label or self::div][1]")
        .innerText()
        .catch(() => "");
      if (!/send|now/i.test(optionText) && /schedule|later/i.test(optionText)) {
        continue;
      }

      await deliveryOption.scrollIntoViewIfNeeded().catch(() => {});
      await deliveryOption.click({ force: true }).catch(() => {});
      await deliveryOption.evaluate((element) => {
        const input = element as HTMLInputElement;
        if (!input.checked) {
          input.click();
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }).catch(() => {});
      const selected = await expect
        .poll(isSelected, { timeout: 5000 })
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);
      if (selected) {
        await expect(this.page.getByRole("button", { name: /^Publish$/i }).first()).toBeEnabled({ timeout: 30000 });
        return;
      }
    }

    throw new Error("Unable to select Send Now delivery option.");
  }

  private async clickSendNowDeliveryByDom() {
    await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
      const visible = (element: Element) => {
        const htmlElement = element as HTMLElement;
        const rect = htmlElement.getBoundingClientRect();
        const style = window.getComputedStyle(htmlElement);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const candidate = Array.from(document.querySelectorAll<HTMLElement>("label, button, div, input[type='radio'], [role='radio']"))
        .find((element) => {
          if (!visible(element)) {
            return false;
          }
          const text = normalize(element.innerText || element.textContent || element.getAttribute("aria-label"));
          if (/^Send Now$/i.test(text)) {
            return true;
          }
          const parentText = normalize(element.closest("label, div")?.textContent);
          return /Send Now/i.test(parentText) && !/Schedule/i.test(text);
        });
      candidate?.click();
      candidate?.dispatchEvent(new Event("input", { bubbles: true }));
      candidate?.dispatchEvent(new Event("change", { bubbles: true }));
    }).catch(() => {});
  }

  private async isSendNowDeliverySelected() {
    return await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
      const controls = Array.from(document.querySelectorAll<HTMLElement>("input[type='radio'], [role='radio']"));
      return controls.some((element) => {
        const input = element as HTMLInputElement;
        const selected = input.checked || element.getAttribute("aria-checked") === "true";
        if (!selected) {
          return false;
        }
        let current: HTMLElement | null = element;
        for (let depth = 0; current && depth < 6; depth += 1) {
          if (/Send Now/i.test(normalize(current.innerText || current.textContent))) {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      });
    }).catch(() => false);
  }

  private async hasAnyVisibleText(pattern: RegExp) {
    const matches = this.page.getByText(pattern);
    const count = await matches.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      if (await matches.nth(index).isVisible().catch(() => false)) {
        return true;
      }
    }

    return false;
  }

  private async expandCampaignPerformanceMatrix(campaignName: string) {
    const matrixVisible = async () => await this.page.getByText(/Sent Count/i).first().isVisible().catch(() => false);
    if (await matrixVisible()) {
      return;
    }

    const campaignRow = this.campaignRow(campaignName);
    await expect(campaignRow).toBeVisible({ timeout: 60000 });
    const expandCell = campaignRow.locator("td").first();
    const directExpandControl = this.page.locator("xpath=/html/body/div[2]/div/div[2]/div[2]/div/div[2]/div[3]/div[4]/div/div[1]/div/table/tbody/tr[1]/td[1]/div");

    if (await directExpandControl.waitFor({ state: "attached", timeout: 5000 }).then(() => true).catch(() => false)) {
      await directExpandControl.evaluate((element) => (element as HTMLElement).click()).catch(() => {});
      let opened = await expect
        .poll(matrixVisible, { timeout: 5000 })
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);
      if (opened) {
        return;
      }

      const directBox = await directExpandControl.boundingBox().catch(() => null);
      if (directBox) {
        await this.page.mouse.click(directBox.x + directBox.width / 2, directBox.y + directBox.height / 2);
        opened = await expect
          .poll(matrixVisible, { timeout: 5000 })
          .toBeTruthy()
          .then(() => true)
          .catch(() => false);
        if (opened) {
          return;
        }
      }
    }

    for (const clickTarget of [
      this.page.locator(".pl-4.cursor-pointer > svg").first(),
      this.page.locator(".pl-4.cursor-pointer").first(),
      expandCell.locator("svg, img, button").first(),
      expandCell.locator("xpath=.//*[name()='svg']").first(),
      expandCell,
    ]) {
      if (!await clickTarget.isVisible().catch(() => false)) {
        continue;
      }

      await clickTarget.scrollIntoViewIfNeeded().catch(() => {});
      await clickTarget.click({ force: true }).catch(async () => {
        const box = await clickTarget.boundingBox().catch(() => null);
        if (box) {
          await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
      });

      const opened = await expect
        .poll(matrixVisible, { timeout: 5000 })
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);
      if (opened) {
        return;
      }
    }

    const cellBox = await expandCell.boundingBox().catch(() => null);
    if (cellBox) {
      await this.page.mouse.click(cellBox.x + 20, cellBox.y + cellBox.height / 2);
      const opened = await expect
        .poll(matrixVisible, { timeout: 5000 })
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);
      if (opened) {
        return;
      }
    }

    throw new Error(`Unable to expand performance matrix for campaign "${campaignName}".`);
  }

  private async selectCallNowDelivery() {
    const selected = await tryClickFirstVisible([
      this.page.getByText(/Call Now/i).locator("xpath=ancestor::*[self::label or self::button or self::div][1]").first(),
      this.page.getByLabel(/Call Now/i).first(),
      this.page.getByText(/Call Now/i).first(),
    ], { force: true });

    if (!selected) {
      throw new Error("Unable to select Call Now delivery option for AI Calling campaign.");
    }
  }

  private async selectReachablePhoneSegment() {
    const selectedSegmentText = await this.selectFirstMatchingSegment("phone");
    await this.refreshCampaignAudienceCount();

    await expect
      .poll(async () => {
        const count = await this.getSelectedSegmentUserCount();
        return count >= 1;
      }, {
        message: `Selected phone segment "${selectedSegmentText}" should have at least 1 reachable user.`,
        timeout: 30000,
      })
      .toBeTruthy();
  }

  private async selectFirstMatchingSegment(searchValue: string) {
    const trigger = this.page.getByRole("button", { name: /Choose a target segment|Select a Segment/i }).first();
    await expect(trigger).toBeVisible({ timeout: 30000 });

    const searchInput = this.page.getByRole("textbox", { name: /Search/i }).first();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await trigger.scrollIntoViewIfNeeded().catch(() => {});
      await trigger.click().catch(async () => {
        await trigger.evaluate((element) => (element as HTMLElement).click()).catch(() => {});
      });

      const opened = await searchInput
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (opened) {
        break;
      }

      await this.page.waitForTimeout(1000);
    }

    await expect(searchInput).toBeVisible({ timeout: 30000 });
    await fillWithFallback(searchInput, searchValue);

    const option = this.page
      .locator("button")
      .filter({ hasText: new RegExp(this.escapeRegex(searchValue), "i") })
      .filter({ hasNotText: /Choose a target segment|Select a Segment/i })
      .first();
    await expect(option).toBeVisible({ timeout: 30000 });

    const optionText = (await option.innerText().catch(() => searchValue)).trim();
    await option.click({ force: true });
    await this.closeOpenDropdown();
    return optionText;
  }

  private async selectFirstAvailableAiCallingScenario() {
    const trigger = this.page.getByRole("button", { name: /Select the scenario/i }).first();
    await expect(trigger).toBeVisible({ timeout: 30000 });

    const scenarioOption = this.page
      .locator("button")
      .filter({ hasText: /scenario/i })
      .filter({ hasNotText: /^Select the scenario$/i })
      .first();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await trigger.scrollIntoViewIfNeeded().catch(() => {});
      await trigger.click().catch(async () => {
        await trigger.evaluate((element) => (element as HTMLElement).click()).catch(() => {});
      });

      const opened = await scenarioOption
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (opened) {
        break;
      }

      await this.page.waitForTimeout(1000);
    }

    await expect(scenarioOption).toBeVisible({ timeout: 30000 });
    await scenarioOption.click({ force: true });
    await this.closeOpenDropdown();
  }

  private async getSelectedSegmentUserCount() {
    const bodyText = await this.page.locator("body").innerText().catch(() => "");
    const match = bodyText.match(/(?:Reachable\s+)?User Count:\s*(\d+)\s*Users/i);
    return match ? Number(match[1]) : 0;
  }

  private async publishCampaign() {
    const publishButton = this.page
      .locator("button")
      .filter({ hasText: /Publish/i })
      .last();
    await this.page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" })).catch(() => {});
    await this.page.waitForTimeout(500);
    await publishButton.scrollIntoViewIfNeeded().catch(() => {});
    await expect(publishButton).toBeEnabled({ timeout: 30000 });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await publishButton.scrollIntoViewIfNeeded().catch(() => {});

      for (const clickPublish of [
        async () => await publishButton.click({ force: true }),
        async () => await publishButton.evaluate((element) => (element as HTMLElement).click()),
        async () => {
          const box = await publishButton.boundingBox();
          if (box) {
            await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          }
        },
      ]) {
        await clickPublish().catch(() => {});
        const modalVisible = await this.page
          .getByText(/Publish Campaign\?/i)
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);
        if (modalVisible) {
          return await this.confirmCampaignPublish();
        }
      }

      if (await this.page.getByText(/Successfully Created Campaign/i).first().isVisible().catch(() => false)) {
        return;
      }

      await this.page.waitForTimeout(1000);
    }

    await this.confirmCampaignPublish();
  }

  private async confirmCampaignPublish() {
    await expect(this.page.getByText(/Publish Campaign\?/i)).toBeVisible({ timeout: 30000 });
    const modalPublishButton = this.page.locator("#root-modal").getByRole("button", { name: /^Publish$/i }).first();
    await expect(modalPublishButton).toBeVisible({ timeout: 30000 });
    await modalPublishButton.click({ force: true });
    await expect(this.page.getByText(/Successfully Created Campaign/i)).toBeVisible({ timeout: 60000 });
  }

  private async verifyCampaignCreated(campaignName: string) {
    const campaignSearch = this.page.getByRole("textbox", { name: /Campaign Search/i }).first();
    if (!await campaignSearch.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tryClickFirstVisible([
        this.page.getByRole("img", { name: /back icon/i }).first(),
        this.page.getByRole("button", { name: /back/i }).first(),
        this.page.locator('img[alt*="back" i]').first(),
      ], { force: true });
    }

    await this.searchCampaign(campaignName);
  }

  private async reloadCampaignListing() {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expect(this.page.getByRole("textbox", { name: /Campaign Search/i }).first()).toBeVisible({
      timeout: 60000,
    });
  }

  private async searchCampaign(campaignName: string) {
    const campaignSearch = this.page.getByRole("textbox", { name: /Campaign Search/i }).first();
    await expect(campaignSearch).toBeVisible({ timeout: 60000 });
    await fillWithFallback(campaignSearch, campaignName);
    await expect(this.page.getByText(new RegExp(`^${this.escapeRegex(campaignName)}$`, "i")).first()).toBeVisible({
      timeout: 60000,
    });
  }

  private async waitForCampaignStatus(campaignName: string, statusPattern: RegExp) {
    await expect
      .poll(async () => {
        await this.searchCampaign(campaignName);
        const rowText = await this.campaignRow(campaignName).innerText().catch(() => "");
        return statusPattern.test(rowText) ? rowText : "";
      }, {
        message: `Campaign "${campaignName}" should reach status ${statusPattern}.`,
        timeout: 90000,
      })
      .not.toBe("");
  }

  private campaignRow(campaignName: string) {
    return this.page.locator("tbody tr").filter({ hasText: new RegExp(this.escapeRegex(campaignName), "i") }).first();
  }

  private async openAllSegments() {
    await this.recoverMartechSessionIfNeeded();

    const segmentSearchVisible = async () =>
      await this.page.getByRole("textbox", { name: /Segment Search/i }).isVisible().catch(() => false);

    if (!await segmentSearchVisible()) {
      const viewAllCandidates = [
        this.page.getByRole("button", { name: /View All Segments/i }).first(),
        this.page.getByText(/View All Segments/i).locator("xpath=ancestor::button[1]").first(),
        this.page.getByText(/View All Segments/i).first(),
      ];

      for (const candidate of viewAllCandidates) {
        if (!await candidate.isVisible().catch(() => false)) {
          continue;
        }

        await candidate.scrollIntoViewIfNeeded().catch(() => {});
        await candidate.click({ force: true }).catch(() => {});
        const opened = await expect
          .poll(segmentSearchVisible, { timeout: 8000 })
          .toBeTruthy()
          .then(() => true)
          .catch(() => false);
        if (opened) {
          break;
        }
      }
    }

    await expect
      .poll(segmentSearchVisible, { timeout: 60000 })
      .toBeTruthy();

    await this.openUploadedSegmentsTab();
  }

  private async openUploadedSegmentsTab() {
    await this.recoverMartechSessionIfNeeded();

    const uploadedTabCandidates = [
      this.page.getByRole("button", { name: /^Uploaded\d*$/i }).first(),
      this.page.getByRole("tab", { name: /^Uploaded\d*$/i }).first(),
      this.page.getByText(/^Uploaded\d*$/i).locator("xpath=ancestor::*[self::button or @role='tab'][1]").first(),
      this.page.getByText(/^Uploaded\d*$/i).first(),
    ];

    await tryClickFirstVisible(uploadedTabCandidates, { force: true });

    await expect
      .poll(async () => {
        const activeUploadedTab = await this.page
          .locator('[aria-selected="true"], [data-state="active"], .active')
          .filter({ hasText: /^Uploaded\d*$/i })
          .first()
          .isVisible()
          .catch(() => false);
        const uploadedText = await this.page.getByText(/^Uploaded\d*$/i).first().isVisible().catch(() => false);
        const searchVisible = await this.page.getByRole("textbox", { name: /Segment Search/i }).isVisible().catch(() => false);
        return searchVisible && (activeUploadedTab || uploadedText);
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  private async recoverMartechSessionIfNeeded() {
    const onLoginPage = await this.page
      .getByRole("textbox", { name: /Enter Mobile Number/i })
      .isVisible()
      .catch(() => false);
    if (!onLoginPage) {
      return;
    }

    if (!this.currentApp || !this.currentManageConstructionUrl) {
      throw new Error("Martech session expired but app configuration was not available for recovery.");
    }

    await this.openActiveLeadCampaigns(this.currentApp);
  }

  private async openRuleBasedSegmentsTab() {
    const ruleBasedTabCandidates = [
      this.page.getByRole("button", { name: /Rule\s*Based\d*/i }).first(),
      this.page.getByRole("tab", { name: /Rule\s*Based\d*/i }).first(),
      this.page.getByText(/Rule\s*Based\d*/i).locator("xpath=ancestor::*[self::button or @role='tab'][1]").first(),
      this.page.getByText(/Rule\s*Based\d*/i).first(),
    ];

    await tryClickFirstVisible(ruleBasedTabCandidates, { force: true });

    await expect
      .poll(async () => {
        const activeRuleBasedTab = await this.page
          .locator('[aria-selected="true"], [data-state="active"], .active')
          .filter({ hasText: /Rule\s*Based\d*/i })
          .first()
          .isVisible()
          .catch(() => false);
        const ruleBasedText = await this.page.getByText(/Rule\s*Based\d*/i).first().isVisible().catch(() => false);
        const searchVisible = await this.page.getByRole("textbox", { name: /Segment Search/i }).isVisible().catch(() => false);
        return searchVisible && (activeRuleBasedTab || ruleBasedText);
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  private async searchSegment(segmentName: string, reopenSegments = async () => await this.openAllSegments()) {
    const searchInput = this.page.getByRole("textbox", { name: /Segment Search/i }).first();
    await expect(searchInput).toBeVisible({ timeout: 60000 });

    const segmentResult = this.page.getByText(new RegExp(this.escapeRegex(segmentName), "i")).last();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await searchInput.fill("");
      await searchInput.fill(segmentName);

      const found = await segmentResult
        .waitFor({ state: "visible", timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      if (found) {
        return;
      }

      await searchInput.fill("");
      await this.page.waitForTimeout(5000);
      await this.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await reopenSegments();
    }

    const bodyText = await this.page.locator("body").innerText().catch(() => "");
    throw new Error(`Created segment "${segmentName}" was not visible in the selected segment tab. Visible page text: ${bodyText.slice(0, 1000)}`);
  }

  private async selectDropdownOption(triggerName: RegExp, optionName: RegExp) {
    const trigger = this.page.getByRole("button", { name: triggerName }).first();
    await expect(trigger).toBeVisible({ timeout: 30000 });
    await trigger.click({ force: true });

    const option = this.page.getByText(optionName).last();
    await expect(option).toBeVisible({ timeout: 30000 });
    await option.click({ force: true });
    await this.closeOpenDropdown();
  }

  private async selectDropdownOptionWithSearch(triggerName: RegExp, searchValue: string) {
    const trigger = this.page.getByRole("button", { name: triggerName }).first();
    await expect(trigger).toBeVisible({ timeout: 30000 });
    await trigger.click({ force: true });

    const searchInput = this.page.getByRole("textbox", { name: /Search/i }).first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fillWithFallback(searchInput, searchValue);
    }

    const optionPattern = new RegExp(this.escapeRegex(searchValue), "i");
    const option = this.page
      .locator("button, [role='button']")
      .filter({ hasText: optionPattern })
      .last();
    await expect(option).toBeVisible({ timeout: 30000 });
    await option.click({ force: true });
    await this.closeOpenDropdown();
  }

  private async closeOpenDropdown() {
    await this.page.keyboard.press("Escape").catch(() => {});
    await this.page.waitForTimeout(500);
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
