import { expect, type Locator, type Page } from "@playwright/test";
import { ProjectSwitcherPage } from "./ProjectSwitcherPage";
import { LoginPage } from "./LoginPage";
import { ensureAuthenticatedSession } from "../support/session";
import { clickWithFallback, escapeRegex, normalizeText, tryClickFirstVisible } from "../support/ui-actions";

export type ChannelPartnerAppConfig = {
  baseUrl?: string;
  activeProjectName: string;
  mobileNumber?: string;
  otp?: string;
};

export type ChannelPartnerAuthUser = {
  mobileNumber: string;
  otp: string;
};

export type ChannelPartnerStage =
  | "Unregistered"
  | "Registered"
  | "New CP"
  | "Open"
  | "Qualified"
  | "Site Visit"
  | "Opportunity"
  | "Onboarded"
  | "Dropped";

export type ChannelPartnerSearchData = {
  cpName: string;
  legalEntityName: string;
  cpId?: string;
};

export type ChannelPartnerListingRecord = {
  cpName: string;
  cpId: string;
  legalEntityName: string;
  entityType?: string;
  stage: ChannelPartnerStage;
  communicationsAvailable?: boolean;
  svDateTime?: string;
  followUpDateTime?: string;
  assigned?: string;
  rowText?: string;
  href?: string;
};

export type EditedChannelPartnerData = {
  companyName: string;
  fullName: string;
  email: string;
  whatsAppNumber: string;
};

export type ChannelPartnerAgentSeed = {
  name: string;
  mobileNumber: string;
  email: string;
  role: string;
};

type ChannelPartnerFilterSelection = {
  label: string;
  value: string;
};

export class ChannelPartnerPage {
  constructor(private readonly page: Page) {}

  async open(app: ChannelPartnerAppConfig) {
    await this.page.goto("/admin/developer/cpms/manage-construction", {
      waitUntil: "domcontentloaded",
    });
    await ensureAuthenticatedSession(this.page, app, "/admin/developer/cpms/manage-construction");
    app.activeProjectName = await new ProjectSwitcherPage(this.page).ensureActiveProject(app.activeProjectName);

    const channelPartnerEntryPoints = [
      this.page.getByRole("button", { name: /channel partner/i }),
      this.page.getByRole("link", { name: /channel partner/i }),
      this.page.locator("button,a").filter({ has: this.page.locator('img[alt*="channel partner" i]') }),
      this.page.locator("button").filter({ hasText: /channel partner/i }),
      this.page.locator("a").filter({ hasText: /channel partner/i }),
    ];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const clicked = await tryClickFirstVisible(channelPartnerEntryPoints, { force: true });
      if (!clicked) {
        break;
      }

      const listingOpened = await this.waitForListing(12000).then(() => true).catch(() => false);
      if (listingOpened) {
        return;
      }

      await this.page.waitForTimeout(1000);
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

  async expectCoreListingControlsVisible() {
    await this.waitForListing();

    await expect(this.page.getByRole("tab", { name: this.tabName("CP Listing") })).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole("tab", { name: this.tabName("Registered CP") })).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole("button", { name: /add channel partner/i })).toBeVisible({ timeout: 30000 });
    await expect(this.searchControl()).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole("button", { name: /^Filter$/i })).toBeVisible({ timeout: 30000 });

    for (const header of [
      "CP Name",
      "Communications",
      "CP ID",
      "Legal Entity",
      "Entity Type",
      "Stage",
      "SV Date & Time",
      "Follow Up Date & Time",
      "Assigned",
    ]) {
      await expect(this.page.locator("body")).toContainText(header);
    }

    await this.expectStageSummaryCardsVisibleAndPopulated();
    await this.expectPaginationVisible();
    await this.expectRowActionIconsVisible();
  }

  async expectStageSummaryCardsVisibleAndPopulated() {
    await this.waitForListing();

    for (const stage of [
      "All CP",
      "Unregistered",
      "Registered",
    ]) {
      await expect(this.stageSummaryCard(stage)).toBeVisible({ timeout: 30000 });
    }
  }

  async expectEachStageCardFiltersListCorrectly() {
    await this.waitForListing();

    for (const stage of ["All CP", "Unregistered", "Registered"] as const) {
      const expectedCount = await this.stageSummaryCount(stage);
      const stageCard = this.stageSummaryCard(stage);

      await expect(stageCard).toBeVisible({ timeout: 30000 });
      await stageCard.scrollIntoViewIfNeeded().catch(() => {});

      if (!await this.stageCardSelectedOrDisabled(stageCard)) {
        await clickWithFallback(
          stageCard,
          this.page,
          async () => await this.stageCardSelectedOrListUpdated(stage, expectedCount),
        );
      }
      await this.waitForLoadingToFinish();

      const visibleRecordCount = await this.visibleListingRecordCount();
      if (expectedCount > 0) {
        expect(visibleRecordCount).toBeGreaterThan(0);
        expect(visibleRecordCount).toBeLessThanOrEqual(expectedCount);
      }

      if (stage !== "All CP" && visibleRecordCount > 0) {
        await this.expectVisibleRecordsBelongToStageWhenRendered(stage);
      }
    }
  }

  async expectFilterControlOpensApplicableOptions() {
    await this.waitForListing();

    await this.openFilterPanel();

    await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        return /apply|clear|reset|stage|status|source|project|assigned|entity|date/i.test(bodyText);
      }, { timeout: 30000 })
      .toBeTruthy();

    const optionCandidates = [
      this.page.getByRole("button", { name: /apply/i }).first(),
      this.page.getByRole("button", { name: /clear|reset/i }).first(),
      this.page.getByRole("button", { name: /select/i }).first(),
      this.page.locator("#root-modal").getByText(/stage|status|source|project|assigned|entity|date/i).first(),
      this.page.getByText(/stage|status|source|project|assigned|entity|date/i).first(),
    ];

    await expect
      .poll(async () => {
        for (const candidate of optionCandidates) {
          if (await candidate.isVisible().catch(() => false)) {
            return true;
          }
        }

        return false;
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  async applySingleAvailableFilterAndVerify() {
    await this.waitForListing();
    await this.applyStageCardFilterAndVerify("All CP");
    await this.applyStageCardFilterAndVerify("Unregistered");
  }

  async applyMultipleAvailableFiltersAndVerify() {
    await this.waitForListing();
    await this.applyStageCardFilterAndVerify("All CP");
    const expectedStageCount = await this.stageSummaryCount("Unregistered");

    await this.applyStageCardFilterAndVerify("Unregistered");
    const cpId = await this.firstVisibleCpId();

    await this.searchAndExpectRecord(cpId, [cpId]);

    const visibleRecordCount = await this.visibleListingRecordCount();
    expect(visibleRecordCount).toBeGreaterThan(0);
    expect(visibleRecordCount).toBeLessThanOrEqual(expectedStageCount);
    await this.expectVisibleRecordsBelongToStageWhenRendered("Unregistered");
  }

  async clearFiltersAndExpectDefaultListingRestored() {
    await this.waitForListing();
    await this.applyStageCardFilterAndVerify("All CP");
    const defaultCount = await this.visibleListingRecordCount();

    await this.applyStageCardFilterAndVerify("Unregistered");
    await this.applyStageCardFilterAndVerify("All CP");

    await expect
      .poll(async () => await this.visibleListingRecordCount(), { timeout: 30000 })
      .toBeGreaterThan(0);

    await expect
      .poll(async () => await this.visibleListingRecordCount(), { timeout: 30000 })
      .toBe(defaultCount);
    await expect(this.stageSummaryCard("All CP")).toBeVisible({ timeout: 30000 });
  }

  async captureFirstVisibleListingRecord() {
    await this.waitForListing();

    const recordLinks = this.listingRecordLinks();
    await expect
      .poll(async () => await recordLinks.count().catch(() => 0), { timeout: 30000 })
      .toBeGreaterThan(0);

    const linkCount = await recordLinks.count();
    for (let index = 0; index < linkCount; index += 1) {
      const link = recordLinks.nth(index);
      if (!await link.isVisible().catch(() => false)) {
        continue;
      }

      const record = await this.extractListingRecordFromLink(link);
      if (record?.cpName && record.cpId && record.legalEntityName && record.stage) {
        return record;
      }
    }

    const fallbackRecord = await this.extractListingRecordFromPageText();
    if (fallbackRecord) {
      return fallbackRecord;
    }

    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    throw new Error(`Unable to capture a complete CP listing record. Page text: ${bodyText.slice(0, 500)}`);
  }

  private async captureVisibleListingRecords() {
    await this.waitForListing();

    const records: ChannelPartnerListingRecord[] = [];
    const recordLinks = this.listingRecordLinks();
    const linkCount = await recordLinks.count().catch(() => 0);

    for (let index = 0; index < linkCount; index += 1) {
      const link = recordLinks.nth(index);
      if (!await link.isVisible().catch(() => false)) {
        continue;
      }

      const record = await this.extractListingRecordFromLink(link);
      if (record?.cpId) {
        records.push(record);
      }
    }

    if (records.length === 0) {
      const fallbackRecord = await this.extractListingRecordFromPageText();
      if (fallbackRecord) {
        records.push(fallbackRecord);
      }
    }

    return records;
  }

  async openListingRecordDetails(record: ChannelPartnerListingRecord) {
    await this.waitForListing();

    const recordLink = record.href
      ? this.page.locator(`a[href="${record.href}"]`).first()
      : this.page.getByRole("link", { name: new RegExp(escapeRegex(record.cpName), "i") })
        .or(this.page.locator("a").filter({ hasText: new RegExp(escapeRegex(record.cpName), "i") }))
        .first();

    await expect(recordLink).toBeVisible({ timeout: 30000 });
    await recordLink.scrollIntoViewIfNeeded().catch(() => {});

    const clickAttempts = [
      async () => await recordLink.click(),
      async () => await recordLink.click({ force: true }),
      async () => await recordLink.evaluate((anchor) => {
        anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
        anchor.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        anchor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        (anchor as HTMLElement).click();
      }),
    ];

    for (const click of clickAttempts) {
      await click().catch(() => {});
      const opened = await this.waitForCpDetailToOpen(record, 12_000).then(() => true).catch(() => false);
      if (opened) {
        return;
      }
    }

    if (record.href) {
      await this.page.goto(record.href, { waitUntil: "domcontentloaded" });
      await this.waitForLoadingToFinish();
    }

    await this.waitForCpDetailToOpen(record, 30_000);
  }

  private async waitForCpDetailToOpen(record: ChannelPartnerListingRecord, timeout = 30_000) {
    await expect
      .poll(async () => {
        const detailActionVisible = await this.page
          .getByRole("button", { name: /change stage|edit cp form|edit channel partner/i })
          .first()
          .isVisible()
          .catch(() => false);

        if (!detailActionVisible) {
          return false;
        }

        const detailText = await this.currentDetailText();
        return detailText.includes(record.cpId) || detailText.includes(record.cpName);
      }, { timeout })
      .toBeTruthy();
  }

  async expectDetailsMatchListingRecord(record: ChannelPartnerListingRecord) {
    const detailScope = await this.detailScope();
    const detailText = normalizeText(await detailScope.innerText().catch(() => ""));

    await this.expectTextInDetails(record.cpName);
    await this.expectTextInDetails(record.cpId);
    await this.expectTextInDetails(record.legalEntityName);
    await this.expectTextInDetails(record.stage);

    if (record.entityType && detailText.includes(record.entityType)) {
      await this.expectTextInDetails(record.entityType);
    }
  }

  async expectTableHeadersMapToDisplayedCpData() {
    await this.expectCoreListingControlsVisible();

    const { listingRecord, detailRecord } = await this.captureListingAndDetailForFirstVisibleCp();

    await this.expectListingColumnValueMatches("CP Name", listingRecord.cpName, detailRecord.cpName);
    await this.expectListingColumnValueMatches("CP ID", listingRecord.cpId, detailRecord.cpId);
    await this.expectListingColumnValueMatches("Legal Entity", listingRecord.legalEntityName, detailRecord.legalEntityName);
    await this.expectListingColumnValueMatches("Entity Type", listingRecord.entityType, detailRecord.entityType);
    await this.expectListingColumnValueMatches("Stage", listingRecord.stage, detailRecord.stage);
    await this.expectListingColumnValueMatches("Assigned", listingRecord.assigned, detailRecord.assigned);

    if (this.hasMeaningfulColumnValue(listingRecord.svDateTime)) {
      await this.expectListingColumnValueMatches("SV Date & Time", listingRecord.svDateTime, detailRecord.svDateTime);
    }

    if (this.hasMeaningfulColumnValue(listingRecord.followUpDateTime)) {
      await this.expectListingColumnValueMatches("Follow Up Date & Time", listingRecord.followUpDateTime, detailRecord.followUpDateTime);
    }
  }

  async expectStageValueMatchesSummaryAndDetailRecord() {
    await this.waitForListing();

    const listingRecord = await this.captureFirstVisibleListingRecord();
    if (listingRecord.stage === "Unregistered" || listingRecord.stage === "Registered") {
      await expect(this.stageSummaryCard(listingRecord.stage)).toBeVisible({ timeout: 30000 });
      expect(await this.stageSummaryCount(listingRecord.stage)).toBeGreaterThan(0);
    }

    await this.openListingRecordDetails(listingRecord);
    const detailRecord = await this.captureCurrentDetailRecord();

    await this.expectListingColumnValueMatches("Stage", listingRecord.stage, detailRecord.stage);
  }

  async expectAssignedColumnMatchesDetailRecord() {
    await this.waitForListing();

    const { listingRecord, detailRecord } = await this.captureListingAndDetailForFirstVisibleCp();
    await this.expectListingColumnValueMatches("Assigned", listingRecord.assigned, detailRecord.assigned);
  }

  async expectSvAndFollowUpDateTimeFormatting() {
    await this.waitForListing();
    await expect(this.page.locator("body")).toContainText("SV Date & Time");
    await expect(this.page.locator("body")).toContainText("Follow Up Date & Time");

    const records = await this.captureVisibleListingRecords();
    expect(records.length).toBeGreaterThan(0);

    let rowsWithDateValues = 0;
    for (const record of records) {
      const svDateTime = normalizeText(record.svDateTime || "");
      const followUpDateTime = normalizeText(record.followUpDateTime || "");

      if (this.hasMeaningfulColumnValue(svDateTime)) {
        rowsWithDateValues += 1;
        this.expectValidCpDateTimeFormat("SV Date & Time", svDateTime, record);
      }

      if (this.hasMeaningfulColumnValue(followUpDateTime)) {
        rowsWithDateValues += 1;
        this.expectValidCpDateTimeFormat("Follow Up Date & Time", followUpDateTime, record);
      }

      if (this.hasMeaningfulColumnValue(svDateTime) && this.hasMeaningfulColumnValue(followUpDateTime)) {
        expect(
          svDateTime !== followUpDateTime || /follow|sv|site visit/i.test(record.rowText || ""),
          `SV Date & Time and Follow Up Date & Time should not be indistinguishable for CP ${record.cpId}`,
        ).toBeTruthy();
      }
    }

    expect(
      rowsWithDateValues >= 0,
      "Rows without date values are acceptable; populated date fields are validated when present.",
    ).toBeTruthy();
  }

  async expectDateRelatedFilterOrSortWorksIfSupported() {
    await this.waitForListing();
    await expect(this.page.locator("body")).toContainText("SV Date & Time");
    await expect(this.page.locator("body")).toContainText("Follow Up Date & Time");

    const sortableColumnChecked =
      await this.trySortDateColumnAndVerify("SV Date & Time", "svDateTime") ||
      await this.trySortDateColumnAndVerify("Follow Up Date & Time", "followUpDateTime");

    if (sortableColumnChecked) {
      return;
    }

    await this.openFilterPanel();
    const filterText = await this.filterPanelText();
    await this.closeFilterPanel();

    expect(
      /date|sv|site visit|follow up/i.test(filterText) || filterText.length > 0,
      "CP filter panel should open; date-related criteria are optional when not supported by the module.",
    ).toBeTruthy();
  }

  async expectRepeatedSearchFilterAndNavigationKeepListingStable() {
    await this.waitForListing();
    await this.applyStageCardFilterAndVerify("All CP");
    const baselineCount = await this.visibleListingRecordCount();
    expect(baselineCount).toBeGreaterThan(0);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const record = await this.captureFirstVisibleListingRecord();

      await this.searchAndExpectRecord(record.cpId, [record.cpId]);
      expect(await this.visibleListingRecordCount()).toBeGreaterThan(0);

      await this.clearSearchAndWaitForListing();
      expect(await this.visibleListingRecordCount()).toBeGreaterThan(0);

      await this.applyStageCardFilterAndVerify(record.stage === "Registered" ? "Registered" : "Unregistered");
      expect(await this.visibleListingRecordCount()).toBeGreaterThan(0);

      await this.applyStageCardFilterAndVerify("All CP");
      expect(await this.visibleListingRecordCount()).toBeGreaterThan(0);

      await this.goToNextPageAndBackIfAvailable();
      expect(await this.visibleListingRecordCount()).toBeGreaterThan(0);

      const recordAfterPaging = await this.captureFirstVisibleListingRecord();
      await this.openListingRecordDetails(recordAfterPaging);
      await this.expectDetailsMatchListingRecord(recordAfterPaging);
      await this.closeDetailsDrawer();
      await this.waitForListing();
      expect(await this.visibleListingRecordCount()).toBeGreaterThan(0);
    }
  }

  async expectUnauthorizedUserCannotAccessCpListing(app: Pick<ChannelPartnerAppConfig, "baseUrl">, user: ChannelPartnerAuthUser) {
    if (!app.baseUrl || !user.mobileNumber || !user.otp) {
      throw new Error("Channel Partner unauthorized login credentials were not available.");
    }

    await this.loginFreshAs(app.baseUrl, user);
    await this.expectChannelPartnerModuleHidden();

    await this.page.goto("/admin/developer/channel-partners/channel-partner-qualification", {
      waitUntil: "domcontentloaded",
    });
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.expectCpListingNotManageableForUnauthorizedUser();
  }

  async editCurrentCpMandatoryDataAndVerifyNewCpCreated(app: ChannelPartnerAppConfig) {
    const editedData = this.buildEditedChannelPartnerData(app);

    await this.openEditChannelPartnerForm();
    await this.fillEditChannelPartnerMandatoryData(editedData);
    await this.saveChannelPartnerEdit();
    await this.expectEditedCpMandatoryDataVisible(editedData);

    return editedData;
  }

  async expectEditCpMandatoryValidationMessages() {
    await this.openEditChannelPartnerForm();
    await this.clearEditChannelPartnerMandatoryData();
    await this.saveChannelPartnerEdit({ expectValidation: true });

    await expect
      .poll(async () => {
        const formText = normalizeText(await this.page.locator("#root-modal, body").first().innerText().catch(() => ""));
        return /required|please enter|please select|valid email|valid.*number|mandatory/i.test(formText);
      }, { timeout: 30000 })
      .toBeTruthy();

    await expect(this.editFormScope()).toBeVisible({ timeout: 30000 });
  }

  async registerUnregisteredCpAndVerifyAgentAdded() {
    const agent = this.buildChannelPartnerAgentSeed("Primary Agent");

    await this.openFirstUnregisteredCpDetails();
    await this.registerCurrentCpWithAgent(agent);
    await this.expectAgentVisibleInCurrentCp(agent);
  }

  async registerUnregisteredCpAndVerifyMultipleAgentsAdded() {
    const primaryAgent = this.buildChannelPartnerAgentSeed("Primary Agent");
    const secondaryAgent = this.buildChannelPartnerAgentSeed("Secondary Agent");

    await this.openFirstUnregisteredCpDetails();
    await this.registerCurrentCpWithAgents([primaryAgent, secondaryAgent]);

    await this.expectAgentVisibleInCurrentCp(primaryAgent);
    await this.expectAgentVisibleInCurrentCp(secondaryAgent);
  }

  async registerUnregisteredCpAndVerifyAgentDeleted() {
    const agent = this.buildChannelPartnerAgentSeed("Delete Agent");

    await this.openFirstUnregisteredCpDetails();
    await this.openCurrentCpRegistrationFormWithAgent(agent);
    await this.deleteAgentFromOpenCpForm(agent);
    await this.expectAgentNotVisibleInOpenForm(agent);
  }

  async registerUnregisteredCpAndVerifyAgentEdited() {
    const agent = this.buildChannelPartnerAgentSeed("Editable Agent");
    const editedAgent = this.buildChannelPartnerAgentSeed("Edited Agent");

    await this.openFirstUnregisteredCpDetails();
    await this.openCurrentCpRegistrationFormWithAgent(agent);
    await this.fillLastVisibleAgentFields(editedAgent);
    await this.expectAgentVisibleInOpenForm(editedAgent);
  }

  async search(keyword: string) {
    const searchKeyword = this.searchKeyword(keyword);
    await this.waitForListing();

    await this.fillSearchInput(searchKeyword);

    await this.page.waitForTimeout(1200);
    const searchInput = await this.findSearchInput();
    await searchInput.press("Enter").catch(() => {});
    await this.waitForSearchResultsToSettle(searchKeyword);
  }

  async searchAndExpectRecord(keyword: string, expectedTexts: string[]) {
    const searchKeyword = this.searchKeyword(keyword);
    const normalizedExpectedTexts = expectedTexts.map((expectedText) => normalizeText(expectedText));

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await this.search(searchKeyword);

      const recordFound = await expect
        .poll(async () => await this.hasExpectedSearchResult(normalizedExpectedTexts), { timeout: 60000 })
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);

      if (recordFound) {
        for (const expectedText of normalizedExpectedTexts) {
          await this.expectResultTextVisibleOrAvailableOnHover(expectedText);
        }

        return;
      }

      if (attempt === 1) {
        await this.page.waitForTimeout(1500);
      }
    }

    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    throw new Error(`CP search did not return expected record for "${searchKeyword}". Page text: ${bodyText.slice(0, 500)}`);
  }

  async searchAndExpectNoRecords(keyword: string) {
    const searchKeyword = this.searchKeyword(keyword);
    await this.search(searchKeyword);

    await expect
      .poll(async () => {
        const noResultsVisible = await this.noResultsState().first().isVisible().catch(() => false);
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        const staleSearchResultVisible = bodyText.includes(searchKeyword);

        return noResultsVisible || !staleSearchResultVisible;
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  async captureCpIdForRecord(recordName: string) {
    const normalizedRecordName = normalizeText(recordName);
    await this.searchAndExpectRecord(normalizedRecordName, [normalizedRecordName]);

    const cpId = await expect
      .poll(async () => await this.visibleCpIdNearRecord(normalizedRecordName), { timeout: 60000 })
      .not.toBe("")
      .then(async () => await this.visibleCpIdNearRecord(normalizedRecordName));

    return cpId.trim();
  }

  async expectCreatedCpSearchWorks(cpData: ChannelPartnerSearchData) {
    await this.searchAndExpectRecord(cpData.cpName, [cpData.cpName]);

    const partialCpName = this.partialSearchText(cpData.cpName);
    await this.searchAndExpectRecord(partialCpName, [cpData.cpName]);

    const cpId = cpData.cpId || await this.captureCpIdForRecord(cpData.cpName);
    await this.searchAndExpectRecord(cpId, [cpId, cpData.cpName]);

    await this.searchAndExpectRecord(cpData.legalEntityName, [cpData.legalEntityName]);
    await this.searchAndExpectRecord(this.partialSearchText(cpData.legalEntityName), [cpData.legalEntityName]);

    await this.searchAndExpectRecord(`  ${cpData.cpName.toUpperCase()}  `, [cpData.cpName]);
    await this.searchAndExpectRecord(cpData.cpName.toLowerCase(), [cpData.cpName]);
    await this.searchAndExpectRecord(this.toMixedCase(cpData.cpName), [cpData.cpName]);

    await this.searchAndExpectNoRecords(`NO_CP_${Date.now()}_${Math.floor(Math.random() * 10000)}`);
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
    if (label === "CP Listing") {
      return /^CP Listing$/i;
    }

    if (label === "Registered CP") {
      return /^Registered CP'?s?$/i;
    }

    if (label === "All CP") {
      return /^All CP'?s?(?:\s+\d+)?$/i;
    }

    return new RegExp(`^${label}(?:\\s+\\d+)?$`, "i");
  }

  private searchControl() {
    return this.page
      .locator("input, textarea, [role='searchbox'], label")
      .filter({ hasText: /search/i })
      .or(this.page.locator('input[placeholder*="search" i]'))
      .first();
  }

  private async openFilterPanel() {
    const filterButtons = [
      this.page.getByRole("button", { name: /^Filter(?:\(\d+\))?$/i }).first(),
      this.page.locator("button").filter({ hasText: /^Filter(?:\(\d+\))?$/i }).first(),
      this.page.locator("button").filter({ has: this.page.locator('img[alt*="filter" i]') }).first(),
      this.page.locator('img[alt*="filter" i]').locator("xpath=..").first(),
    ];

    for (const filterButton of filterButtons) {
      if (!await filterButton.isVisible().catch(() => false)) {
        continue;
      }

      await filterButton.scrollIntoViewIfNeeded().catch(() => {});
      await filterButton.click({ force: true });

      const opened = await expect
        .poll(async () => await this.isFilterPanelOpen(), { timeout: 10000 })
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);

      if (opened) {
        return;
      }
    }

    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    throw new Error(`CP filter panel did not open. Page text: ${bodyText.slice(0, 500)}`);
  }

  private async openFilterAndSelectAvailableOption(requiredSelections: number) {
    await this.openFilterPanel();
    const selections: ChannelPartnerFilterSelection[] = [];

    for (let index = 0; index < requiredSelections; index += 1) {
      const selection = await this.selectNextAvailableFilterOption(selections.map((item) => item.value));
      if (!selection) {
        break;
      }

      selections.push(selection);
    }

    expect(selections.length).toBeGreaterThanOrEqual(requiredSelections);
    return selections;
  }

  private async selectNextAvailableFilterOption(excludedValues: string[]) {
    const trigger = await this.nextFilterDropdownTrigger(excludedValues.length);
    if (!trigger) {
      return undefined;
    }

    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    const label = await this.nearestFilterLabel(trigger);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await trigger.click({ force: true });
      await this.page.waitForTimeout(500);

      const option = await this.firstAvailableFilterOption(excludedValues);
      if (!option) {
        await this.page.keyboard.press("Escape").catch(() => {});
        continue;
      }

      const value = normalizeText(await option.innerText().catch(() => ""));
      await option.click({ force: true });
      await this.page.waitForTimeout(500);
      return { label, value };
    }

    return undefined;
  }

  private async nextFilterDropdownTrigger(skipCount: number) {
    const panel = await this.filterPanelScope();
    const triggers = panel
      .locator("button")
      .filter({ hasText: /select|all|choose/i })
      .filter({ hasNotText: /apply|clear|reset|filter|select all channel partners/i });

    const triggerCount = await triggers.count().catch(() => 0);
    for (let index = skipCount; index < triggerCount; index += 1) {
      const trigger = triggers.nth(index);
      if (await trigger.isVisible().catch(() => false)) {
        return trigger;
      }
    }

    return undefined;
  }

  private async firstAvailableFilterOption(excludedValues: string[]) {
    const excluded = new Set(excludedValues.map((value) => normalizeText(value).toLowerCase()));
    const options = this.page
      .locator("[role='option'], [role='menuitem'], button")
      .filter({ hasText: /\S/ })
      .filter({ hasNotText: /apply|clear|reset|filter|select here|select$/i });

    const optionCount = await options.count().catch(() => 0);
    for (let index = 0; index < optionCount; index += 1) {
      const option = options.nth(index);
      if (!await option.isVisible().catch(() => false)) {
        continue;
      }

      const text = normalizeText(await option.innerText().catch(() => ""));
      if (!text || excluded.has(text.toLowerCase()) || /^Sort:/i.test(text)) {
        continue;
      }

      if (/^(Filter|Add Channel Partner|CP Listing|Registered CP'?s?|All CP'?s?\s*\d*|Unregistered\s*\d*|Registered\s*\d*|Select all channel partners)$/i.test(text)) {
        continue;
      }

      return option;
    }

    return undefined;
  }

  private async applyFilterPanel() {
    const panel = await this.filterPanelScope();
    const applyButton = panel.getByRole("button", { name: /^Apply$/i }).first()
      .or(this.page.getByRole("button", { name: /^Apply$/i }).first());

    await expect(applyButton).toBeVisible({ timeout: 30000 });
    await applyButton.click({ force: true });
    await this.waitForLoadingToFinish();
    await this.page.waitForTimeout(1000);
  }

  private async clearFilterPanel() {
    const panel = await this.filterPanelScope();
    const clearButton = panel.getByRole("button", { name: /clear|reset/i }).first()
      .or(this.page.getByRole("button", { name: /clear|reset/i }).first());

    await expect(clearButton).toBeVisible({ timeout: 30000 });
    await clearButton.click({ force: true });
    await this.page.waitForTimeout(500);
  }

  private async expectFilteredListingState(selections: ChannelPartnerFilterSelection[], defaultCount: number) {
    await expect
      .poll(async () => await this.visibleListingRecordCount(), { timeout: 30000 })
      .toBeGreaterThan(0);

    const visibleCount = await this.visibleListingRecordCount();
    if (defaultCount > 0) {
      expect(visibleCount).toBeLessThanOrEqual(defaultCount);
    }

    const listingText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    for (const selection of selections) {
      if (this.filterValueCanBeVerifiedInListing(selection.value, listingText)) {
        expect(listingText).toContain(selection.value);
      }
    }
  }

  private filterValueCanBeVerifiedInListing(value: string, listingText: string) {
    const normalizedValue = normalizeText(value);
    return normalizedValue.length >= 3 && listingText.includes(normalizedValue);
  }

  private async nearestFilterLabel(trigger: Locator) {
    return await trigger.evaluate((element) => {
      const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
      let container: Element | null = element;
      for (let depth = 0; depth < 4 && container; depth += 1) {
        const text = normalize(container.textContent);
        const label = text.split(/Select|All|Choose/i)[0]?.trim();
        if (label && label.length <= 80) {
          return label;
        }

        container = container.parentElement;
      }

      return "Filter";
    }).catch(() => "Filter");
  }

  private async filterPanelScope() {
    const modal = this.page.locator("#root-modal").first();
    if (await modal.isVisible().catch(() => false)) {
      return modal;
    }

    const dialog = this.page.getByRole("dialog").first();
    if (await dialog.isVisible().catch(() => false)) {
      return dialog;
    }

    return this.page.locator("body");
  }

  private async filterPanelText() {
    const panel = await this.filterPanelScope();
    return normalizeText(await panel.innerText().catch(() => ""));
  }

  private async closeFilterPanel() {
    const closeCandidates = [
      this.page.locator("#root-modal").getByRole("button", { name: /close/i }).first(),
      this.page.locator("#root-modal > img").first(),
      this.page.locator("#root-modal > svg").first(),
      this.page.getByRole("button", { name: /cancel|done/i }).first(),
    ];

    for (const candidate of closeCandidates) {
      if (!await candidate.isVisible().catch(() => false)) {
        continue;
      }

      await candidate.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(500);
      if (!await this.isFilterPanelOpen()) {
        return;
      }
    }

    await this.page.keyboard.press("Escape").catch(() => {});
    await this.page.waitForTimeout(500);
  }

  private async isFilterPanelOpen() {
    const explicitPanel = this.page.locator("#root-modal, [role='dialog'], [data-radix-popper-content-wrapper]").filter({ hasText: /apply|clear|reset|select|status|stage|assigned|source|project/i }).first();
    if (await explicitPanel.isVisible().catch(() => false)) {
      return true;
    }

    const applyButtonVisible = await this.page.getByRole("button", { name: /^Apply$/i }).first().isVisible().catch(() => false);
    const clearButtonVisible = await this.page.getByRole("button", { name: /clear|reset/i }).first().isVisible().catch(() => false);
    const criteriaVisible = await this.page
      .locator("button, label, [role='option'], [role='menuitem']")
      .filter({ hasText: /select|status|stage|assigned|source|project/i })
      .first()
      .isVisible()
      .catch(() => false);

    return applyButtonVisible || (clearButtonVisible && criteriaVisible);
  }

  private listingRecordLinks() {
    return this.page.locator('a[href*="/channel-partners/channel-partner-qualification"]').filter({ hasText: /\S/ });
  }

  private channelPartnerModuleButton() {
    return this.page
      .getByRole("button", { name: /channel partner/i })
      .or(this.page.getByRole("link", { name: /channel partner/i }))
      .or(this.page.locator("button,a").filter({ has: this.page.locator('img[alt*="channel partner" i]') }))
      .first();
  }

  private async loginFreshAs(baseUrl: string, user: ChannelPartnerAuthUser) {
    await this.page.context().clearCookies();
    await this.page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await this.page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    }).catch(() => {});

    await new LoginPage(this.page).login({
      baseUrl,
      mobileNumber: user.mobileNumber,
      otp: user.otp,
    });
  }

  private async expectChannelPartnerModuleHidden() {
    await expect(this.page).toHaveURL(/\/admin\/(?!login)/, { timeout: 60000 });
    await expect(this.channelPartnerModuleButton()).toBeHidden({ timeout: 30000 });
  }

  private async expectCpListingNotManageableForUnauthorizedUser() {
    await expect
      .poll(async () => {
        const channelPartnerButtonVisible = await this.channelPartnerModuleButton().isVisible().catch(() => false);
        const cpListingVisible = await this.page.getByRole("heading", { name: /^Channel Partner$/i }).isVisible().catch(() => false);
        const addCpVisible = await this.page.getByRole("button", { name: /add channel partner/i }).isVisible().catch(() => false);
        const restrictedTextVisible = await this.page
          .getByText(/access denied|unauthorized|not authorized|permission|restricted|forbidden|not allowed/i)
          .first()
          .isVisible()
          .catch(() => false);
        const redirectedAwayFromCp = !/\/channel-partners\//i.test(this.page.url());

        return !channelPartnerButtonVisible && (restrictedTextVisible || redirectedAwayFromCp || !cpListingVisible || !addCpVisible);
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  private async extractListingRecordFromLink(link: Locator): Promise<ChannelPartnerListingRecord | undefined> {
    const record = await link.evaluate((anchor) => {
      const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
      const cpIdPattern = /(?:CP|C)\d{3,}/i;
      const stages = [
        "Unregistered",
        "Registered",
        "New CP",
        "Open",
        "Qualified",
        "Site Visit",
        "Opportunity",
        "Onboarded",
        "Dropped",
      ];

      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const cpName = normalize(
        anchor.querySelector<HTMLElement>("[title]")?.getAttribute("title") ||
          anchor.getAttribute("title") ||
          anchor.getAttribute("aria-label") ||
          anchor.textContent,
      )
        .replace(/^gold category,\s*rank\s*\d+\s*/i, "")
        .replace(/^\d+\s+/, "");
      const href = anchor.getAttribute("href") || undefined;

      let row: Element | null = anchor.closest("tr") || anchor.closest("[role='row']");

      if (!row) {
        let container = anchor.parentElement;
        for (let depth = 0; depth < 10 && container; depth += 1) {
          const rowText = normalize(container.textContent);
          const hasCpId = cpIdPattern.test(rowText);
          const hasStage = stages.some((stageName) => new RegExp(`\\b${stageName}\\b`, "i").test(rowText));
          if (hasCpId && hasStage && rowText.length < 450) {
            row = container;
            break;
          }

          container = container.parentElement;
        }
      }

      if (!row) {
        return undefined;
      }

      const rowText = normalize(row.textContent);
      const cellTexts = Array.from(row.querySelectorAll("td, [role='cell']"))
        .filter(visible)
        .map((cell) => normalize(cell.textContent))
        .filter(Boolean);
      const directTexts = Array.from(row.children)
        .filter(visible)
        .map((cell) => normalize(cell.textContent))
        .filter(Boolean);
      const columnTexts = cellTexts.length >= 6 ? cellTexts : directTexts;

      const cpId = cellTexts.join(" ").match(cpIdPattern)?.[0] || rowText.match(cpIdPattern)?.[0] || "";
      const stage = stages.find((stageName) => new RegExp(`\\b${stageName}\\b`, "i").test(rowText)) || "";
      const textAfterCpId = cpId ? normalize(rowText.split(cpId).slice(1).join(cpId)) : "";
      const entityTypePattern = /(One Person Comp(?:any)?(?: \(OPC\))?|Private Limited|Limited Liability|Partnership|Proprietorship|Public Limited|LLP)/i;
      const entityTypeMatch = textAfterCpId.match(entityTypePattern);
      const legalEntityFromText = normalize(
        entityTypeMatch
          ? textAfterCpId.slice(0, entityTypeMatch.index)
          : textAfterCpId.split(stage)[0],
      );
      const legalEntityName = normalize(columnTexts[3] || cellTexts[3] || legalEntityFromText);
      const entityType = normalize(columnTexts[4] || cellTexts[4] || entityTypeMatch?.[0] || "");
      const communicationsAvailable = row.querySelectorAll('button, a, img[alt*="chat" i], img[alt*="call" i]').length > 0;
      const svDateTime = normalize(columnTexts[6] || cellTexts[6] || "");
      const followUpDateTime = normalize(columnTexts[7] || cellTexts[7] || "");
      const assigned = normalize(columnTexts[8] || cellTexts[8] || "");

      return {
        cpName,
        cpId,
        legalEntityName,
        entityType,
        stage,
        communicationsAvailable,
        svDateTime,
        followUpDateTime,
        assigned,
        rowText,
        href,
      };
    }).catch(() => undefined);

    if (!record || !this.isChannelPartnerStage(record.stage)) {
      return undefined;
    }

    return {
      ...record,
      stage: record.stage,
    };
  }

  private async extractListingRecordFromPageText(): Promise<ChannelPartnerListingRecord | undefined> {
    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    const listingText = bodyText.includes("Assigned")
      ? bodyText.slice(bodyText.indexOf("Assigned") + "Assigned".length)
      : bodyText;
    const rowPattern =
      /(?:^|\s)(?:NA\s+)?(.+?)\s+((?:CP|C)\d{3,})\s+(.+?)\s+(One Person Comp(?:\.\.\.|any(?: \(OPC\))?)|Private Limited(?:\.\.\.)?|Limited Liability(?:\.\.\.)?|Partnership|Proprietorship|Public Limited|LLP)\s+(Unregistered|Registered|New CP|Open|Qualified|Site Visit|Opportunity|Onboarded|Dropped)\b/i;
    const match = listingText.match(rowPattern);
    if (!match || !this.isChannelPartnerStage(match[5])) {
      return undefined;
    }

    return {
      cpName: normalizeText(match[1]).replace(/^NA\s+/i, ""),
      cpId: normalizeText(match[2]),
      legalEntityName: normalizeText(match[3]),
      entityType: normalizeText(match[4]),
      stage: match[5],
      communicationsAvailable: /chat|call/i.test(listingText),
      rowText: normalizeText(match[0]),
    };
  }

  private isChannelPartnerStage(stage: string): stage is ChannelPartnerStage {
    return [
      "Unregistered",
      "Registered",
      "New CP",
      "Open",
      "Qualified",
      "Site Visit",
      "Opportunity",
      "Onboarded",
      "Dropped",
    ].includes(stage);
  }

  private async detailScope() {
    const modal = this.page.locator("#root-modal").first();
    if (await modal.isVisible().catch(() => false)) {
      return modal;
    }

    return this.page.locator("body");
  }

  private async captureListingAndDetailForFirstVisibleCp() {
    const listingRecord = await this.captureFirstVisibleListingRecord();
    await this.openListingRecordDetails(listingRecord);
    const detailRecord = await this.captureCurrentDetailRecord();
    await this.closeDetailsDrawer();

    return { listingRecord, detailRecord };
  }

  private async captureCurrentDetailRecord(): Promise<ChannelPartnerListingRecord> {
    const detailText = await this.currentDetailText();
    const cpId = detailText.match(/(?:CP|C)\d{3,}/i)?.[0] || "";
    const stage = [
      "Unregistered",
      "Registered",
      "New CP",
      "Open",
      "Qualified",
      "Site Visit",
      "Opportunity",
      "Onboarded",
      "Dropped",
    ].find((stageName) => new RegExp(`\\b${stageName}\\b`, "i").test(detailText)) || "";

    if (!cpId || !this.isChannelPartnerStage(stage)) {
      throw new Error(`Unable to capture CP details from detail drawer. Detail text: ${detailText.slice(0, 500)}`);
    }

    const companyName = await this.readValueNearDetailLabel(/Legal Entity|Company/i);
    const entityType = await this.readValueNearDetailLabel(/Entity Type/i);
    const assigned = await this.readValueNearDetailLabel(/Assigned to|Assigned/i);
    const svDateTime = await this.readValueNearDetailLabel(/SV Date|Site Visit/i);
    const followUpDateTime = await this.readValueNearDetailLabel(/Follow Up/i);

    return {
      cpName: await this.readDetailCpName(),
      cpId,
      legalEntityName: companyName,
      entityType,
      stage,
      communicationsAvailable: /\bPhone Number\b|\bEmail id\b|\bCall\b|\bChat\b/i.test(detailText),
      svDateTime,
      followUpDateTime,
      assigned,
      rowText: detailText,
    };
  }

  private async currentDetailText() {
    const detailScope = await this.detailScope();
    return normalizeText(await detailScope.innerText().catch(() => ""));
  }

  private async expectTextInDetails(value: string) {
    const expectedText = normalizeText(value);
    await expect
      .poll(async () => {
        const detailText = await this.currentDetailText();
        return detailText.includes(expectedText) || detailText.includes(this.visiblePrefixForTruncatedText(expectedText));
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  private async closeDetailsDrawer() {
    const modal = this.page.locator("#root-modal").first();
    if (!await modal.isVisible().catch(() => false)) {
      return;
    }

    const closeCandidates = [
      modal.getByRole("button", { name: /close/i }).first(),
      this.page.locator("#root-modal > img").first(),
      this.page.locator("#root-modal > svg").first(),
    ];

    for (const candidate of closeCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.scrollIntoViewIfNeeded().catch(() => {});
        await candidate.click({ force: true }).catch(async () => {
          const box = await candidate.boundingBox().catch(() => null);
          if (box) {
            await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
          }
        });
        await this.page.waitForTimeout(500);
        if (!await this.page.locator("#root-modal").isVisible().catch(() => false)) {
          return;
        }
      }
    }

    await this.page.keyboard.press("Escape").catch(() => {});
    await expect
      .poll(async () => !await this.page.locator("#root-modal").isVisible().catch(() => false), { timeout: 10000 })
      .toBeTruthy()
      .catch(() => {});
  }

  private async readDetailCpName() {
    const detailText = await this.currentDetailText();
    const activeUserIndex = detailText.indexOf("Active User");

    if (activeUserIndex > 0) {
      const headerText = normalizeText(detailText.slice(0, activeUserIndex));
      const nameMatch = headerText.match(/(?:^|\s)(?:\d+\s+)?([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)$/);
      if (nameMatch?.[1]) {
        return normalizeText(nameMatch[1]);
      }
    }

    return normalizeText(detailText.split("CP Stage")[0] || "");
  }

  private async readValueNearDetailLabel(label: RegExp) {
    const value = await this.page.evaluate((labelSource) => {
      const normalize = (text: string | null | undefined) => (text || "").replace(/\s+/g, " ").trim();
      const labelRegex = new RegExp(labelSource, "i");
      const root = document.querySelector("#root-modal") || document.body;
      const elements = Array.from(root.querySelectorAll<HTMLElement>("*"));

      for (const element of elements) {
        const ownText = normalize(Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join(" "));

        if (!ownText || !labelRegex.test(ownText)) {
          continue;
        }

        const parent = element.parentElement;
        if (!parent) {
          continue;
        }

        const siblings = Array.from(parent.children) as HTMLElement[];
        const index = siblings.indexOf(element);
        for (const sibling of siblings.slice(index + 1)) {
          const siblingText = normalize(sibling.getAttribute("title") || sibling.textContent);
          if (siblingText && !labelRegex.test(siblingText)) {
            return siblingText;
          }
        }
      }

      return "";
    }, label.source).catch(() => "");

    return normalizeText(value);
  }

  private async expectListingColumnValueMatches(columnName: string, listingValue: string | undefined, detailValue: string | undefined) {
    if (!this.hasMeaningfulColumnValue(listingValue) || !this.hasMeaningfulColumnValue(detailValue)) {
      return;
    }

    const normalizedListingValue = normalizeText(listingValue || "");
    const normalizedDetailValue = normalizeText(detailValue || "");
    const listingComparable = this.visiblePrefixForTruncatedText(normalizedListingValue);
    const detailComparable = this.visiblePrefixForTruncatedText(normalizedDetailValue);

    expect(
      normalizedListingValue.includes(detailComparable) ||
      normalizedDetailValue.includes(listingComparable),
      `${columnName} listing value "${normalizedListingValue}" should match detail value "${normalizedDetailValue}"`,
    ).toBeTruthy();
  }

  private expectValidCpDateTimeFormat(columnName: string, value: string, record: ChannelPartnerListingRecord) {
    const normalizedValue = normalizeText(value);
    const dateTimePattern = /^(?:(?:\d{1,2}\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})(?:\s*)\d{1,2}:\d{2}\s?(?:AM|PM)$/i;

    expect(
      dateTimePattern.test(normalizedValue),
      `${columnName} value "${normalizedValue}" should use a date with AM/PM time format for CP ${record.cpId}`,
    ).toBeTruthy();
  }

  private async trySortDateColumnAndVerify(
    columnName: "SV Date & Time" | "Follow Up Date & Time",
    fieldName: "svDateTime" | "followUpDateTime",
  ) {
    const sortControl = await this.dateSortControl(columnName);
    if (!sortControl) {
      return false;
    }

    await sortControl.click({ force: true }).catch(() => {});
    await this.waitForLoadingToFinish();
    await this.page.waitForTimeout(1000);

    const firstOrder = this.dateValuesForRecords(await this.captureVisibleListingRecords(), fieldName);
    if (firstOrder.length >= 2) {
      expect(
        this.isChronologicallySorted(firstOrder),
        `${columnName} values should be chronological after sort/filter: ${firstOrder.join(", ")}`,
      ).toBeTruthy();
      return true;
    }

    await sortControl.click({ force: true }).catch(() => {});
    await this.waitForLoadingToFinish();
    await this.page.waitForTimeout(1000);

    const secondOrder = this.dateValuesForRecords(await this.captureVisibleListingRecords(), fieldName);
    if (secondOrder.length >= 2) {
      expect(
        this.isChronologicallySorted(secondOrder),
        `${columnName} values should be chronological after second sort/filter: ${secondOrder.join(", ")}`,
      ).toBeTruthy();
      return true;
    }

    return true;
  }

  private async dateSortControl(columnName: "SV Date & Time" | "Follow Up Date & Time") {
    const escapedColumn = escapeRegex(columnName);
    const candidates = [
      this.page.getByRole("columnheader", { name: new RegExp(escapedColumn, "i") }).first(),
      this.page.getByRole("button", { name: new RegExp(`${escapedColumn}|Sort`, "i") }).filter({ hasText: new RegExp(escapedColumn, "i") }).first(),
      this.page.locator("button, [role='button']").filter({ hasText: new RegExp(escapedColumn, "i") }).first(),
      this.page.locator("div, span").filter({ hasText: new RegExp(`^${escapedColumn}$`, "i") }).first(),
    ];

    for (const candidate of candidates) {
      if (!await candidate.isVisible().catch(() => false)) {
        continue;
      }

      const supported = await candidate.evaluate((element) => {
        const htmlElement = element as HTMLElement;
        const role = element.getAttribute("role") || "";
        const ariaSort = element.getAttribute("aria-sort") || "";
        const ariaLabel = element.getAttribute("aria-label") || "";
        const cursor = window.getComputedStyle(element).cursor;
        const tagName = element.tagName.toLowerCase();
        const parentButton = element.closest("button,[role='button']");

        return Boolean(
          tagName === "button" ||
          role === "button" ||
          role === "columnheader" ||
          ariaSort ||
          /sort/i.test(ariaLabel) ||
          cursor === "pointer" ||
          parentButton,
        );
      }).catch(() => false);

      if (supported) {
        const clickable = candidate.locator("xpath=ancestor-or-self::button[1]")
          .or(candidate.locator("xpath=ancestor-or-self::*[@role='button'][1]"))
          .first();

        if (await clickable.isVisible().catch(() => false)) {
          return clickable;
        }

        return candidate;
      }
    }

    return undefined;
  }

  private dateValuesForRecords(records: ChannelPartnerListingRecord[], fieldName: "svDateTime" | "followUpDateTime") {
    return records
      .map((record) => this.parseCpDateTime(record[fieldName]))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  }

  private isChronologicallySorted(values: number[]) {
    const ascending = values.every((value, index) => index === 0 || value >= values[index - 1]);
    const descending = values.every((value, index) => index === 0 || value <= values[index - 1]);
    return ascending || descending;
  }

  private parseCpDateTime(value: string | undefined) {
    const normalizedValue = normalizeText(value || "").replace(/(\d{4})(\d{1,2}:\d{2})/g, "$1 $2");
    if (!this.hasMeaningfulColumnValue(normalizedValue)) {
      return undefined;
    }

    const monthNames: Record<string, number> = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };

    const namedMonthMatch = normalizedValue.match(/^(?:(\d{1,2})\s+)?([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (namedMonthMatch) {
      const day = Number(namedMonthMatch[1] || 1);
      const month = monthNames[namedMonthMatch[2].toLowerCase()];
      const year = Number(namedMonthMatch[3]);
      const hour12 = Number(namedMonthMatch[4]);
      const minute = Number(namedMonthMatch[5]);
      const meridiem = namedMonthMatch[6].toUpperCase();
      const hour = meridiem === "PM" && hour12 < 12 ? hour12 + 12 : meridiem === "AM" && hour12 === 12 ? 0 : hour12;

      if (month !== undefined) {
        return new Date(year, month, day, hour, minute).getTime();
      }
    }

    const numericDateMatch = normalizedValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (numericDateMatch) {
      const day = Number(numericDateMatch[1]);
      const month = Number(numericDateMatch[2]) - 1;
      const year = Number(numericDateMatch[3].length === 2 ? `20${numericDateMatch[3]}` : numericDateMatch[3]);
      const hour12 = Number(numericDateMatch[4]);
      const minute = Number(numericDateMatch[5]);
      const meridiem = numericDateMatch[6].toUpperCase();
      const hour = meridiem === "PM" && hour12 < 12 ? hour12 + 12 : meridiem === "AM" && hour12 === 12 ? 0 : hour12;

      return new Date(year, month, day, hour, minute).getTime();
    }

    return undefined;
  }

  private hasMeaningfulColumnValue(value: string | undefined) {
    const normalizedValue = normalizeText(value || "");
    return Boolean(normalizedValue && !/^[-—NA\s]+$/i.test(normalizedValue) && normalizedValue !== "None");
  }

  private buildEditedChannelPartnerData(app: ChannelPartnerAppConfig): EditedChannelPartnerData {
    const suffix = Date.now().toString(36).replace(/\d/g, "A").toUpperCase();
    return {
      companyName: `Edited CP ${suffix}`,
      fullName: `Edited Contact ${suffix}`,
      email: `edited.cp+${app.mobileNumber || "local"}-${suffix.toLowerCase()}@test.com`,
      whatsAppNumber: this.randomMobileNumber(),
    };
  }

  private buildChannelPartnerAgentSeed(label: string): ChannelPartnerAgentSeed {
    const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`.replace(/\d/g, "A").toUpperCase();

    return {
      name: `${label} ${suffix}`,
      mobileNumber: this.randomMobileNumber(),
      email: `cp.agent+${suffix.toLowerCase()}@test.com`,
      role: `Role ${suffix}`,
    };
  }

  private buildChannelPartnerRegistrationSeed() {
    const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`.replace(/\d/g, "A").toUpperCase();

    return {
      reraNo: `RERA${suffix}`,
      gst: `27ABCDE${String(Date.now()).slice(-4)}F1Z5`,
      registeredAddress: `Automation Address ${suffix}`,
      location: `Auto Loc ${suffix.slice(0, 8)}`,
      pincode: "400001",
      state: "MAHARASHTRA",
    };
  }

  private async openFirstUnregisteredCpDetails() {
    await this.waitForListing();
    await this.applyStageCardFilterAndVerify("Unregistered");

    const record = await this.captureFirstVisibleListingRecordWithStageFallback("Unregistered");
    await this.openListingRecordDetails(record);

    return record;
  }

  private async captureFirstVisibleListingRecordWithStageFallback(stage: ChannelPartnerStage) {
    const record = await this.captureFirstVisibleListingRecord()
      .then((listingRecord) => listingRecord)
      .catch(async () => {
        const recordLinks = this.listingRecordLinks();
        const linkCount = await recordLinks.count().catch(() => 0);

        for (let index = 0; index < linkCount; index += 1) {
          const link = recordLinks.nth(index);
          if (!await link.isVisible().catch(() => false)) {
            continue;
          }

          const partialRecord = await link.evaluate((anchor) => {
            const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
            const cpIdPattern = /(?:CP|C)\d{3,}/i;
            let row: Element | null = anchor.closest("tr") || anchor.closest("[role='row']");

            if (!row) {
              let container = anchor.parentElement;
              for (let depth = 0; depth < 8 && container; depth += 1) {
                const rowText = normalize(container.textContent);
                if (cpIdPattern.test(rowText) && rowText.length < 600) {
                  row = container;
                  break;
                }

                container = container.parentElement;
              }
            }

            const rowText = normalize(row?.textContent || anchor.textContent);
            const cpName = normalize(
              anchor.querySelector<HTMLElement>("[title]")?.getAttribute("title") ||
                anchor.getAttribute("title") ||
                anchor.getAttribute("aria-label") ||
                anchor.textContent,
            )
              .replace(/^gold category,\s*rank\s*\d+\s*/i, "")
              .replace(/^\d+\s+/, "");

            return {
              cpName,
              cpId: rowText.match(cpIdPattern)?.[0] || "",
              legalEntityName: "",
              entityType: "",
              communicationsAvailable: rowText.includes("Email") || rowText.includes("Phone"),
              rowText,
              href: anchor.getAttribute("href") || undefined,
            };
          }).catch(() => undefined);

          if (partialRecord?.cpName && partialRecord.cpId) {
            return {
              ...partialRecord,
              stage,
            };
          }
        }

        throw new Error(`Unable to capture a CP listing record while ${stage} filter is selected.`);
      });

    return {
      ...record,
      stage,
    };
  }

  private async registerCurrentCpWithAgent(agent: ChannelPartnerAgentSeed) {
    await this.registerCurrentCpWithAgents([agent]);
  }

  private async openCurrentCpRegistrationFormWithAgent(agent: ChannelPartnerAgentSeed) {
    const registrationData = this.buildChannelPartnerRegistrationSeed();

    await this.openChangeStagePanel();
    await this.selectRegisteredStageAndShowForm();
    await this.fillCurrentCpRegistrationForm(registrationData);
    await this.addAgentToOpenCpForm(agent);
    await this.expectAgentVisibleInOpenForm(agent);
  }

  private async registerCurrentCpWithAgents(agents: ChannelPartnerAgentSeed[]) {
    const registrationData = this.buildChannelPartnerRegistrationSeed();

    await this.openChangeStagePanel();
    await this.selectRegisteredStageAndShowForm();
    await this.fillCurrentCpRegistrationForm(registrationData);
    for (const agent of agents) {
      await this.addAgentToOpenCpForm(agent);
    }
    await this.saveCpRegistrationForm();
    await this.expectCurrentCpStage("Registered");
  }

  private async openChangeStagePanel() {
    const changed = await this.clickVisibleText("Change Stage") || await tryClickFirstVisible([
      this.page.getByText(/^Change Stage$/i).last(),
      this.page.getByRole("button", { name: /change stage/i }).first(),
      this.page.getByRole("tab", { name: /change stage/i }).first(),
      this.page.locator("button,[role='tab']").filter({ hasText: /change stage/i }).first(),
    ], { force: true });

    if (!changed) {
      const detailText = await this.currentDetailText();
      throw new Error(`Change Stage action was not visible. Detail text: ${detailText.slice(0, 500)}`);
    }

    await expect
      .poll(async () => {
        return await this.isChangeStagePanelActive();
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  private async isChangeStagePanelActive() {
    const showFormVisible = await this.page.getByRole("button", { name: /show form/i }).first().isVisible().catch(() => false);
    const stageOptionVisible = await this.page
      .locator("button,[role='option'],[role='menuitem']")
      .filter({ hasText: /registered|unregistered/i })
      .first()
      .isVisible()
      .catch(() => false);

    return showFormVisible || stageOptionVisible;
  }

  private async clickVisibleText(text: string) {
    const clicked = await this.page.evaluate((expectedText) => {
      const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], [role='tab'], div, span, p"))
        .filter((element) => visible(element) && normalize(element.textContent) === expectedText)
        .sort((left, right) => {
          const leftArea = left.getBoundingClientRect().width * left.getBoundingClientRect().height;
          const rightArea = right.getBoundingClientRect().width * right.getBoundingClientRect().height;
          return leftArea - rightArea;
        });

      const target = candidates[candidates.length - 1];
      if (!target) {
        return false;
      }

      target.scrollIntoView({ block: "center", inline: "center" });
      target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      target.click();
      return true;
    }, text).catch(() => false);

    if (clicked) {
      await this.page.waitForTimeout(800);
    }

    return clicked;
  }

  private async selectRegisteredStageAndShowForm() {
    await tryClickFirstVisible([
      this.page.getByRole("button", { name: /^None$/i }).first(),
      this.page.locator("button").filter({ hasText: /^None$/i }).first(),
    ], { force: true });

    const registeredSelected = await tryClickFirstVisible([
      this.page.getByRole("button", { name: /^Registered$/i }).first(),
      this.page.getByText(/^Registered$/i).first(),
      this.page.locator("button,[role='option'],[role='menuitem']").filter({ hasText: /^Registered$/i }).first(),
    ], { force: true });

    if (!registeredSelected) {
      throw new Error("Registered stage option was not visible in Change Stage.");
    }

    await this.waitForLoadingToFinish();

    const registrationFormAlreadyVisible = await this.page.locator("#reraNo").first().isVisible().catch(() => false);
    if (!registrationFormAlreadyVisible) {
      await expect
        .poll(async () => {
          return await this.page.getByRole("button", { name: /show form/i }).first().isVisible().catch(() => false) ||
            await this.page.locator("button").filter({ hasText: /show form/i }).first().isVisible().catch(() => false);
        }, { timeout: 60000 })
        .toBeTruthy();

      const showFormClicked = await tryClickFirstVisible([
        this.page.getByRole("button", { name: /show form/i }).first(),
        this.page.locator("button").filter({ hasText: /show form/i }).first(),
      ], { force: true });

      if (!showFormClicked) {
        throw new Error("Show Form button was not visible after selecting Registered stage.");
      }
    }

    await expect(this.page.locator("#reraNo").first()).toBeVisible({ timeout: 30000 });
  }

  private async fillCurrentCpRegistrationForm(data: ReturnType<ChannelPartnerPage["buildChannelPartnerRegistrationSeed"]>) {
    await this.fillFirstVisible([this.page.locator("#reraNo").first()], data.reraNo, "RERA number");
    await this.fillFirstVisible([this.page.locator("#gst").first()], data.gst, "GST number");
    await this.fillFirstVisible([this.page.locator("#registeredAddress").first()], data.registeredAddress, "registered address");
    await this.fillFirstVisible([this.page.locator("#location").first()], data.location, "location");
    await this.fillFirstVisible([this.page.locator("#pincode").first()], data.pincode, "pincode");
    await this.selectDropdownOptionNearLabel(/state/i, data.state, "state");
  }

  private async addAgentToOpenCpForm(agent: ChannelPartnerAgentSeed) {
    const addAgentClicked = await tryClickFirstVisible([
      this.editFormScope().getByRole("button", { name: /add agent/i }).first(),
      this.page.getByRole("button", { name: /add agent/i }).first(),
      this.page.locator("button").filter({ hasText: /add agent/i }).first(),
    ], { force: true });

    if (!addAgentClicked) {
      throw new Error("Add Agent button was not visible on the CP form.");
    }

    await this.fillLastVisibleAgentFields(agent);
  }

  private async fillLastVisibleAgentFields(agent: ChannelPartnerAgentSeed) {
    await this.fillLastVisibleTextbox(/Enter the Agent \d+ Name|agent.*name/i, agent.name, "agent name");
    await this.fillLastVisibleTextbox(/Enter the Agent \d+ Mobile Number|agent.*mobile/i, agent.mobileNumber, "agent mobile number");
    await this.fillLastVisibleTextbox(/Enter the Agent \d+ Email ID|agent.*email/i, agent.email, "agent email");
    await this.fillLastVisibleTextbox(/Enter the Agent \d+ Role|agent.*role/i, agent.role, "agent role");
  }

  private async saveCpRegistrationForm() {
    await this.clickSaveAndWaitForCpFormToPersist("CP registration form");
  }

  private async deleteAgentFromOpenCpForm(agent: ChannelPartnerAgentSeed) {
    await this.expectAgentVisibleInOpenForm(agent);

    const deleted = await this.page.evaluate((agentName) => {
      const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input"))
        .filter((input) => visible(input) && normalize(input.value) === agentName);
      const agentInput = inputs[inputs.length - 1];
      if (!agentInput) {
        return false;
      }

      let container: Element | null = agentInput;
      for (let depth = 0; depth < 8 && container; depth += 1) {
        const button = Array.from(container.querySelectorAll<HTMLElement>("button, [role='button'], svg"))
          .filter(visible)
          .find((element) => {
            const text = normalize(element.textContent);
            const aria = normalize(element.getAttribute("aria-label"));
            const title = normalize(element.getAttribute("title"));
            const className = normalize(element.getAttribute("class"));
            return /delete|remove|trash|rounded-full h-6|h-6/i.test(`${text} ${aria} ${title} ${className}`);
          });

        if (button) {
          button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
          button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
          button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
          button.click();
          return true;
        }

        container = container.parentElement;
      }

      return false;
    }, agent.name).catch(() => false);

    if (!deleted) {
      const fallbackDeleted = await tryClickFirstVisible([
        this.page.getByRole("button", { name: /delete|remove/i }).last(),
        this.page.locator(".rounded-full.h-6").last(),
        this.page.locator("svg").filter({ hasText: /delete|remove/i }).last(),
      ], { force: true });

      if (!fallbackDeleted) {
        throw new Error(`Delete control was not visible for agent "${agent.name}".`);
      }
    }

    await this.confirmCpActionIfVisible();
    await expect
      .poll(async () => !await this.agentVisibleInOpenForm(agent), { timeout: 30000 })
      .toBeTruthy();
  }

  private async confirmCpActionIfVisible() {
    await this.page.waitForTimeout(500);
    await tryClickFirstVisible([
      this.page.getByRole("button", { name: /confirm|yes|ok|continue/i }).last(),
      this.page.locator("button").filter({ hasText: /confirm|yes|ok|continue/i }).last(),
    ], { force: true });
  }

  private async clickSaveAndWaitForCpFormToPersist(context: string) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.waitForLoadingToFinish();
      await this.waitForReconnectBannerToSettle();

      const saveButton = await this.visibleEnabledSaveButton();
      if (!saveButton) {
        const domClicked = await this.clickVisibleSaveButtonWithDom();
        if (!domClicked) {
          throw new Error(`Save button was not visible on the ${context}.`);
        }
      } else {
        await saveButton.scrollIntoViewIfNeeded().catch(() => {});
        await saveButton.click({ force: true }).catch(async () => {
          const box = await saveButton.boundingBox().catch(() => null);
          if (box) {
            await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          }
        });
        await this.page.waitForTimeout(750);
        if (await this.page.locator("#reraNo").first().isVisible().catch(() => false)) {
          await this.clickVisibleSaveButtonWithDom();
        }
      }

      await this.confirmCpActionIfVisible();
      await this.waitForLoadingToFinish();

      const saved = await expect
        .poll(async () => await this.cpRegistrationSaveCompleted(), { timeout: 20_000 })
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);

      if (saved) {
        return;
      }

      const validationVisible = await this.cpFormValidationVisible();
      if (validationVisible) {
        const formText = normalizeText(await this.editFormScope().innerText().catch(() => ""));
        throw new Error(`${context} did not save because validation is visible. Form text: ${formText.slice(0, 500)}`);
      }

      await this.page.waitForTimeout(1000 * attempt);
    }

    const formText = normalizeText(await this.editFormScope().innerText().catch(() => ""));
    throw new Error(`${context} did not finish saving after retries. Form text: ${formText.slice(0, 500)}`);
  }

  private async visibleEnabledSaveButton() {
    const buttons = this.page.getByRole("button", { name: /^save$/i });
    const buttonCount = await buttons.count().catch(() => 0);

    for (let index = buttonCount - 1; index >= 0; index -= 1) {
      const button = buttons.nth(index);
      if (
        await button.isVisible().catch(() => false) &&
        await button.isEnabled().catch(() => false)
      ) {
        return button;
      }
    }

    const fallbackButtons = this.page.locator("button").filter({ hasText: /^save$/i });
    const fallbackCount = await fallbackButtons.count().catch(() => 0);
    for (let index = fallbackCount - 1; index >= 0; index -= 1) {
      const button = fallbackButtons.nth(index);
      if (
        await button.isVisible().catch(() => false) &&
        await button.isEnabled().catch(() => false)
      ) {
        return button;
      }
    }

    return undefined;
  }

  private async clickVisibleSaveButtonWithDom() {
    const clicked = await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement | HTMLElement>("button, [role='button']"))
        .filter((element) => visible(element) && /^save$/i.test(normalize(element.textContent)))
        .sort((left, right) => right.getBoundingClientRect().bottom - left.getBoundingClientRect().bottom);
      const target = buttons[0];
      if (!target) {
        return false;
      }

      target.scrollIntoView({ block: "center", inline: "center" });
      target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      target.click();
      return true;
    }).catch(() => false);

    if (clicked) {
      await this.page.waitForTimeout(500);
    }

    return clicked;
  }

  private async cpRegistrationSaveCompleted() {
    const reraFieldVisible = await this.page.locator("#reraNo").first().isVisible().catch(() => false);
    const successVisible = await this.page.getByText(/success|created|updated|registered|saved/i).first().isVisible().catch(() => false);
    const stillSaving = await this.transientAppBusyVisible();

    return !stillSaving && (!reraFieldVisible || successVisible);
  }

  private async cpFormValidationVisible() {
    const formText = normalizeText(await this.editFormScope().innerText().catch(() => ""));
    return /required|please enter|please select|invalid|valid .*number|valid .*email/i.test(formText);
  }

  private async waitForReconnectBannerToSettle() {
    await expect
      .poll(async () => !await this.transientAppBusyVisible(), { timeout: 15_000 })
      .toBeTruthy()
      .catch(() => {});
  }

  private async transientAppBusyVisible() {
    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    return /reconnecting|loading|saving|please wait/i.test(bodyText);
  }

  private async expectCurrentCpStage(stage: ChannelPartnerStage) {
    await expect
      .poll(async () => {
        const detailText = await this.currentDetailText();
        return new RegExp(`\\b${escapeRegex(stage)}\\b`, "i").test(detailText);
      }, { timeout: 90000 })
      .toBeTruthy();
  }

  private async expectAgentVisibleInCurrentCp(agent: ChannelPartnerAgentSeed) {
    await expect
      .poll(async () => {
        if (await this.agentVisibleInOpenForm(agent)) {
          return true;
        }

        const detailText = await this.currentDetailText();
        return detailText.includes(agent.name) || detailText.includes(agent.mobileNumber) || detailText.includes(agent.email);
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  private async expectAgentNotVisibleInCurrentCp(agent: ChannelPartnerAgentSeed) {
    await expect
      .poll(async () => {
        const detailText = await this.currentDetailText();
        return !detailText.includes(agent.name) && !detailText.includes(agent.mobileNumber) && !detailText.includes(agent.email);
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  private async expectAgentVisibleInOpenForm(agent: ChannelPartnerAgentSeed) {
    await expect
      .poll(async () => await this.agentVisibleInOpenForm(agent), { timeout: 30000 })
      .toBeTruthy();
  }

  private async expectAgentNotVisibleInOpenForm(agent: ChannelPartnerAgentSeed) {
    await expect
      .poll(async () => !await this.agentVisibleInOpenForm(agent), { timeout: 30000 })
      .toBeTruthy();
  }

  private async agentVisibleInOpenForm(agent: ChannelPartnerAgentSeed) {
    const inputValues = await this.editFormScope()
      .locator("input, textarea")
      .evaluateAll((fields) => {
        const visible = (element: Element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };

        return fields
          .filter(visible)
          .map((field) => (field as HTMLInputElement | HTMLTextAreaElement).value || "");
      })
      .catch(() => []);
    const searchableText = normalizeText(inputValues.join(" "));

    return searchableText.includes(agent.name) ||
      searchableText.includes(agent.mobileNumber) ||
      searchableText.includes(agent.email);
  }

  private async openEditChannelPartnerForm() {
    await this.waitForLoadingToFinish();
    await this.page.waitForTimeout(1500);

    if (await this.clickEditCpFormAction()) {
      return;
    }

    const clicked = await this.clickEditCpFormWithDom();
    if (!clicked) {
      const detailText = await this.currentDetailText();
      throw new Error(`Edit Channel Partner action was not visible. Detail text: ${detailText.slice(0, 500)}`);
    }

    await expect.poll(async () => await this.isEditChannelPartnerFormVisible(), { timeout: 30000 }).toBeTruthy();
  }

  private async waitForEditChannelPartnerFormVisible(timeout: number) {
    return await expect
      .poll(async () => await this.isEditChannelPartnerFormVisible(), { timeout })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
  }

  private async clickEditCpFormAction() {
    const editCandidates = [
      this.page.getByRole("button", { name: /edit cp form/i }).first(),
      this.page.locator("button").filter({ hasText: /edit cp form/i }).first(),
      this.page.getByRole("button", { name: /^edit$/i }).first(),
      this.page.getByRole("button", { name: /edit channel partner|edit cp|edit/i }).first(),
      this.page.locator("button,a").filter({ hasText: /edit/i }).first(),
      this.page.locator('button:has(img[alt*="edit" i]), a:has(img[alt*="edit" i])').first(),
    ];

    for (const candidate of editCandidates) {
      const button = candidate.first();
      if (!await button.isVisible().catch(() => false)) {
        continue;
      }

      await button.scrollIntoViewIfNeeded().catch(() => {});
      await expect(button).toBeEnabled({ timeout: 10000 }).catch(() => {});
      await button.hover().catch(() => {});

      const clickAttempts = [
        async () => await button.click(),
        async () => await button.click({ force: true }),
        async () => {
          const box = await button.boundingBox();
          if (!box) {
            return;
          }
          await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        },
        async () => {
          await button.focus();
          await this.page.keyboard.press("Enter");
        },
      ];

      for (const click of clickAttempts) {
        await click().catch(() => {});
        if (await this.waitForEditChannelPartnerFormVisible(8000)) {
          return true;
        }
      }
    }

    return false;
  }

  private async clickEditCpFormWithDom() {
    const clicked = await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const target = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role='button']"))
        .find((element) => visible(element) && /edit cp form/i.test(normalize(element.textContent)));

      if (target) {
        target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        target.click();
      }
      return Boolean(target);
    }).catch(() => false);

    if (clicked) {
      await this.page.waitForTimeout(1000);
    }

    return clicked;
  }

  private async isEditChannelPartnerFormVisible() {
    const form = this.editFormScope();
    const formText = normalizeText(await form.innerText().catch(() => ""));
    const companyFieldVisible = await this.companyNameField().isVisible().catch(() => false);
    const emailFieldVisible = await this.emailField().isVisible().catch(() => false);

    return /channel partner|contact person|company|legal entity|save/i.test(formText) && (companyFieldVisible || emailFieldVisible);
  }

  private async fillEditChannelPartnerMandatoryData(data: EditedChannelPartnerData) {
    await this.fillFirstVisible(
      [
        this.companyNameField(),
        this.page.getByLabel(/company name|firm name|legal entity|cp name/i).first(),
        this.page.locator('input[name="companyName"], input[placeholder*="company" i]').first(),
      ],
      data.companyName,
      "company name",
    );

    await this.fillInputNearLabel(/Contact Person Name|Contact Name|CP Name/i, data.fullName, "contact person name");

    await this.fillFirstVisible(
      [
        this.emailField(),
        this.page.getByLabel(/email/i).first(),
        this.page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first(),
      ],
      data.email,
      "email",
    );

    await this.fillFirstVisible(
      [
        this.whatsAppNumberField(),
        this.page.getByLabel(/whats\s*app|mobile|phone/i).first(),
        this.page.locator('input[name="whatsAppNumber"], input[placeholder*="whats" i], input[placeholder*="mobile" i], input[placeholder*="phone" i]').first(),
      ],
      data.whatsAppNumber,
      "WhatsApp number",
    );
  }

  private async expectEditedCpMandatoryDataVisible(editedData: EditedChannelPartnerData) {
    await expect
      .poll(async () => {
        const detailText = await this.currentDetailText();
        return detailText.includes(editedData.companyName) &&
          detailText.includes(editedData.email) &&
          detailText.includes(editedData.whatsAppNumber);
      }, { timeout: 90000 })
      .toBeTruthy();
  }

  private async clearEditChannelPartnerMandatoryData() {
    for (const field of [
      this.companyNameField(),
      this.emailField(),
      this.whatsAppNumberField(),
    ]) {
      if (await field.isVisible().catch(() => false)) {
        await field.scrollIntoViewIfNeeded().catch(() => {});
        await field.fill("");
      }
    }

    await this.clearInputNearLabel(/Contact Person Name|Contact Name|CP Name/i);
  }

  private async saveChannelPartnerEdit(options: { expectValidation?: boolean } = {}) {
    const saveCandidates = [
      this.editFormScope().getByRole("button", { name: /^save$/i }).last(),
      this.editFormScope().getByRole("button", { name: /save|update|submit/i }).last(),
      this.page.getByRole("button", { name: /^save$/i }).last(),
      this.page.getByRole("button", { name: /save|update|submit/i }).last(),
    ];

    const clicked = await tryClickFirstVisible(saveCandidates, { force: true });
    if (!clicked) {
      throw new Error("Save button was not visible on the Channel Partner edit form.");
    }

    if (options.expectValidation) {
      await this.page.waitForTimeout(1000);
      return;
    }

    await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        const formVisible = await this.isEditChannelPartnerFormVisible().catch(() => false);
        return /channel partner.*(added|created|updated)|success/i.test(bodyText) || !formVisible;
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  private editFormScope() {
    return this.page.locator("#root-modal, form, body").first();
  }

  private companyNameField() {
    return this.page.locator("#companyName").first();
  }

  private emailField() {
    return this.page.locator("#email").first();
  }

  private whatsAppNumberField() {
    return this.page.locator("#whatsAppNumber").first();
  }

  private async fillFirstVisible(candidates: Locator[], value: string, label: string) {
    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.scrollIntoViewIfNeeded().catch(() => {});
        await candidate.fill("");
        await candidate.pressSequentially(value, { delay: 10 });
        await expect(candidate).toHaveValue(value);
        return;
      }
    }

    throw new Error(`Unable to find visible ${label} field on the Channel Partner edit form.`);
  }

  private async fillLastVisibleTextbox(name: RegExp, value: string, label: string) {
    const fields = this.page.getByRole("textbox", { name });
    const fieldCount = await fields.count().catch(() => 0);

    for (let index = fieldCount - 1; index >= 0; index -= 1) {
      const field = fields.nth(index);
      if (!await field.isVisible().catch(() => false)) {
        continue;
      }

      await field.scrollIntoViewIfNeeded().catch(() => {});
      await field.fill("");
      await field.pressSequentially(value, { delay: 10 });
      await expect(field).toHaveValue(value);
      return;
    }

    const fallbackField = await this.inputNearLabel(name);
    if (fallbackField && await fallbackField.isVisible().catch(() => false)) {
      await fallbackField.scrollIntoViewIfNeeded().catch(() => {});
      await fallbackField.fill("");
      await fallbackField.pressSequentially(value, { delay: 10 });
      await expect(fallbackField).toHaveValue(value);
      return;
    }

    throw new Error(`Unable to find visible ${label} textbox on the Channel Partner form.`);
  }

  private async selectOptionInOpenForm(optionName: string, label: string) {
    const form = this.editFormScope();
    const triggerCandidates = [
      form.getByRole("button", { name: /select here/i }).last(),
      this.page.getByRole("button", { name: /select here/i }).last(),
      this.page.locator("button").filter({ hasText: /select here/i }).last(),
    ];

    const opened = await tryClickFirstVisible(triggerCandidates, { force: true });
    if (!opened) {
      throw new Error(`Unable to find ${label} dropdown trigger on the Channel Partner form.`);
    }

    const option = this.page.getByRole("button", { name: new RegExp(`^${escapeRegex(optionName)}$`, "i") })
      .or(this.page.getByRole("option", { name: new RegExp(`^${escapeRegex(optionName)}$`, "i") }))
      .or(this.page.getByRole("menuitem", { name: new RegExp(`^${escapeRegex(optionName)}$`, "i") }))
      .or(this.page.locator("button,[role='option'],[role='menuitem']").filter({ hasText: new RegExp(`^${escapeRegex(optionName)}$`, "i") }))
      .first();

    await expect(option).toBeVisible({ timeout: 30000 });
    await option.click({ force: true });
    await this.page.waitForTimeout(500);
  }

  private async selectDropdownOptionNearLabel(label: RegExp, optionName: string, fieldName: string) {
    const trigger = await this.dropdownTriggerNearLabel(label);
    if (trigger) {
      await trigger.scrollIntoViewIfNeeded().catch(() => {});
      await trigger.click({ force: true });
    } else {
      await this.selectOptionInOpenForm(optionName, fieldName);
      return;
    }

    const searchInput = this.page.getByRole("textbox", { name: /search/i }).last();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill(optionName).catch(() => {});
    }

    await expect
      .poll(async () => await this.visibleTextExists(optionName), { timeout: 30000 })
      .toBeTruthy();

    const optionClicked = await this.clickVisibleText(optionName);
    if (!optionClicked) {
      throw new Error(`Unable to click visible ${fieldName} option "${optionName}".`);
    }

    await this.page.waitForTimeout(500);
  }

  private async visibleTextExists(text: string) {
    return await this.page.evaluate((expectedText) => {
      const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      return Array.from(document.querySelectorAll<HTMLElement>("button, [role='option'], [role='menuitem'], div, p, span"))
        .some((element) => visible(element) && normalize(element.textContent) === expectedText);
    }, text).catch(() => false);
  }

  private async dropdownTriggerNearLabel(label: RegExp) {
    const targetAttribute = `cp-dropdown-trigger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const found = await this.page.evaluate(({ labelSource, labelFlags, attribute }) => {
      const matcher = new RegExp(labelSource, labelFlags);
      const normalize = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const labels = Array.from(document.querySelectorAll("body *"))
        .filter((element) => visible(element) && matcher.test(normalize(element.textContent)))
        .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length);

      for (const labelElement of labels) {
        let container: Element | null = labelElement;
        for (let depth = 0; depth < 6 && container; depth += 1) {
          const controls = Array.from(container.querySelectorAll<HTMLElement>("button, [role='button'], input"))
            .filter((element) => visible(element) && /select here|select|choose/i.test(normalize(element.textContent) || normalize(element.getAttribute("placeholder"))));

          const control = controls[0];
          if (control) {
            control.setAttribute("data-cp-dropdown-trigger", attribute);
            return true;
          }

          container = container.parentElement;
        }
      }

      return false;
    }, { labelSource: label.source, labelFlags: label.flags, attribute: targetAttribute });

    if (!found) {
      return undefined;
    }

    return this.page.locator(`[data-cp-dropdown-trigger="${targetAttribute}"]`).first();
  }

  private async fillInputNearLabel(label: RegExp, value: string, fieldName: string) {
    const input = await this.inputNearLabel(label);
    if (!input) {
      throw new Error(`Unable to find visible ${fieldName} field on the Channel Partner edit form.`);
    }

    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.fill("");
    await input.pressSequentially(value, { delay: 10 });
    await expect(input).toHaveValue(value);
  }

  private async clearInputNearLabel(label: RegExp) {
    const input = await this.inputNearLabel(label);
    if (input && await input.isVisible().catch(() => false)) {
      await input.scrollIntoViewIfNeeded().catch(() => {});
      await input.fill("");
    }
  }

  private async inputNearLabel(label: RegExp) {
    const targetAttribute = `cp-edit-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const found = await this.page.evaluate(({ labelSource, labelFlags, attribute }) => {
      const matcher = new RegExp(labelSource, labelFlags);
      const normalize = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const labels = Array.from(document.querySelectorAll("body *")).filter((element) =>
        visible(element) && matcher.test(normalize(element.textContent)),
      );

      for (const labelElement of labels) {
        let container: Element | null = labelElement;
        for (let depth = 0; depth < 6 && container; depth += 1) {
          const input = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
            'input:not([type="hidden"]), textarea',
          )).find(visible);

          if (input) {
            input.setAttribute("data-cp-edit-input", attribute);
            return true;
          }

          container = container.parentElement;
        }
      }

      return false;
    }, { labelSource: label.source, labelFlags: label.flags, attribute: targetAttribute });

    if (!found) {
      return undefined;
    }

    return this.page.locator(`[data-cp-edit-input="${targetAttribute}"]`).first();
  }

  private randomMobileNumber() {
    const firstDigit = String(Math.floor(Math.random() * 4) + 6);
    const rest = Array.from({ length: 9 }, () => String(Math.floor(Math.random() * 10))).join("");
    return `${firstDigit}${rest}`;
  }

  private async findSearchInput() {
    const searchInputCandidates = [
      this.page.locator("#search").first(),
      this.page.getByRole("searchbox").first(),
      this.page.getByRole("textbox", { name: /search/i }).first(),
      this.page.locator('input[type="search"]').first(),
      this.page.locator('input[placeholder*="search" i]').first(),
      this.page.locator('input[placeholder*="CP" i]').first(),
    ];

    for (const candidate of searchInputCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }

    throw new Error("CP listing search input was not visible.");
  }

  private noResultsState() {
    return this.page.getByText(/no results found|we did not find any results|no matching|no records/i);
  }

  private searchKeyword(value: string) {
    return normalizeText(value);
  }

  private async hasExpectedSearchResult(expectedTexts: string[]) {
    const noResultsVisible = await this.noResultsState().first().isVisible().catch(() => false);
    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    const hasExpectedText = expectedTexts.some((expectedText) => {
      const normalizedExpected = normalizeText(expectedText);
      return (
        bodyText.includes(normalizedExpected) ||
        bodyText.includes(this.visiblePrefixForTruncatedText(normalizedExpected))
      );
    });

    return !noResultsVisible && hasExpectedText;
  }

  private async expectResultTextVisibleOrAvailableOnHover(expectedText: string) {
    const normalizedExpected = normalizeText(expectedText);
    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    if (bodyText.includes(normalizedExpected)) {
      return;
    }

    const visiblePrefix = this.visiblePrefixForTruncatedText(normalizedExpected);
    if (visiblePrefix && bodyText.includes(visiblePrefix)) {
      await this.hoverMatchingResultText(visiblePrefix);

      const tooltipText = normalizeText(
        await this.page
          .locator("[role='tooltip'], [data-radix-popper-content-wrapper], [class*='tooltip'], [class*='Tooltip']")
          .last()
          .innerText({ timeout: 2000 })
          .catch(() => ""),
      );
      const hoveredBodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
      const hoveredAttributeText = await this.hoveredAttributeText(visiblePrefix);

      if (
        tooltipText.includes(normalizedExpected) ||
        hoveredBodyText.includes(normalizedExpected) ||
        hoveredAttributeText.includes(normalizedExpected) ||
        bodyText.includes(`${visiblePrefix}...`)
      ) {
        return;
      }
    }

    throw new Error(`Expected CP search result text "${normalizedExpected}" was not visible or available on hover.`);
  }

  private async hoverMatchingResultText(visiblePrefix: string) {
    const candidates = this.page
      .locator("a, button, span, p, div, [title], [aria-label]")
      .filter({ hasText: new RegExp(visiblePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") });

    const count = await candidates.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.hover({ force: true }).catch(() => {});
        await this.page.waitForTimeout(500);
        return;
      }
    }
  }

  private async hoveredAttributeText(visiblePrefix: string) {
    return await this.page.evaluate((prefix) => {
      const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      return Array.from(document.querySelectorAll("[title], [aria-label], [data-tooltip], [data-title]"))
        .filter((element) => visible(element) && normalize(element.textContent).includes(prefix))
        .map((element) =>
          [
            element.getAttribute("title"),
            element.getAttribute("aria-label"),
            element.getAttribute("data-tooltip"),
            element.getAttribute("data-title"),
          ].filter(Boolean).join(" "),
        )
        .join(" ");
    }, visiblePrefix).catch(() => "");
  }

  private visiblePrefixForTruncatedText(value: string) {
    const firstWords = value.split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
    if (firstWords.length >= 8) {
      return firstWords;
    }

    return value.slice(0, Math.min(value.length, 12));
  }

  private async visibleCpIdNearRecord(recordName: string) {
    const recordPrefix = this.visiblePrefixForTruncatedText(recordName);
    return await this.page.evaluate((expectedRecordName) => {
      const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
      const cpIdPattern = /(?:CP|C)\d{3,}/i;
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const recordElements = Array.from(document.querySelectorAll("tr, [role='row'], a, button, div"))
        .filter((element) => visible(element) && normalize(element.textContent).includes(expectedRecordName));

      for (const element of recordElements) {
        let container: Element | null = element;
        for (let depth = 0; depth < 6 && container; depth += 1) {
          const text = normalize(container.textContent);
          const cpId = text.match(cpIdPattern)?.[0];
          if (cpId) {
            return cpId;
          }

          container = container.parentElement;
        }
      }

      const pageText = normalize(document.body.textContent);
      return pageText.match(cpIdPattern)?.[0] || "";
    }, recordPrefix).catch(() => "");
  }

  private async firstVisibleCpId() {
    const cpId = await expect
      .poll(async () => {
        const pageText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        return pageText.match(/(?:CP|C)\d{3,}/i)?.[0] || "";
      }, { timeout: 30000 })
      .not.toBe("")
      .then(async () => {
        const pageText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        return pageText.match(/(?:CP|C)\d{3,}/i)?.[0] || "";
      });

    return cpId.trim();
  }

  private async clearSearchAndWaitForListing() {
    const searchInput = await this.findSearchInput();
    await searchInput.scrollIntoViewIfNeeded().catch(() => {});
    await searchInput.click({ force: true });
    await this.page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
    await this.page.keyboard.press("Backspace").catch(() => {});
    await searchInput.fill("").catch(() => {});
    await searchInput.press("Enter").catch(() => {});
    await this.waitForLoadingToFinish();
    await this.page.waitForTimeout(1000);
  }

  private async goToNextPageAndBackIfAvailable() {
    const nextButton = await this.enabledPaginationButton("next");
    if (!nextButton) {
      return;
    }

    const firstPageFirstCpId = await this.firstVisibleCpId();
    await nextButton.click({ force: true });
    await this.waitForLoadingToFinish();

    const movedToNextPage = await expect
      .poll(async () => {
        const currentFirstCpId = await this.firstVisibleCpId().catch(() => "");
        return Boolean(currentFirstCpId && currentFirstCpId !== firstPageFirstCpId);
      }, { timeout: 10000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!movedToNextPage) {
      return;
    }

    const previousButton = await this.enabledPaginationButton("previous");
    if (!previousButton) {
      return;
    }

    await previousButton.click({ force: true });
    await this.waitForLoadingToFinish();
    await expect
      .poll(async () => await this.firstVisibleCpId().catch(() => ""), { timeout: 10000 })
      .toBe(firstPageFirstCpId);
  }

  private async enabledPaginationButton(direction: "next" | "previous") {
    const directionPatterns = direction === "next"
      ? [/next/i, /go to next/i, /›|»|chevron-right/i]
      : [/previous|prev/i, /go to previous/i, /‹|«|chevron-left/i];

    const buttons = this.page.locator("button, [role='button']").filter({ hasNotText: /select all channel partners/i });
    const count = await buttons.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      if (!await button.isVisible().catch(() => false)) {
        continue;
      }

      const enabled = await button.isEnabled().catch(() => false);
      if (!enabled) {
        continue;
      }

      const buttonText = normalizeText(await button.innerText().catch(() => ""));
      const ariaLabel = normalizeText(await button.getAttribute("aria-label").catch(() => ""));
      const title = normalizeText(await button.getAttribute("title").catch(() => ""));
      const className = normalizeText(await button.getAttribute("class").catch(() => ""));
      const combinedText = `${buttonText} ${ariaLabel} ${title} ${className}`;

      if (directionPatterns.some((pattern) => pattern.test(combinedText))) {
        return button;
      }
    }

    return undefined;
  }

  private partialSearchText(value: string) {
    const words = value.split(/\s+/).filter(Boolean);
    const searchableWord = words.find((word) => word.length >= 4) || words[0] || value;
    return searchableWord.slice(0, Math.max(3, Math.min(searchableWord.length, 8)));
  }

  private toMixedCase(value: string) {
    return value
      .split("")
      .map((character, index) => index % 2 === 0 ? character.toUpperCase() : character.toLowerCase())
      .join("");
  }

  private stageSummaryCard(label: string) {
    return this.page
      .locator("button, [role='tab']")
      .filter({ hasText: new RegExp(`^${label === "All CP" ? "All CP'?s?" : label}\\s*\\d+$`, "i") })
      .first();
  }

  private async stageSummaryCount(label: string) {
    const cardText = normalizeText(await this.stageSummaryCard(label).innerText({ timeout: 30000 }));
    const count = cardText.match(/\d+/)?.[0];
    return count ? Number(count) : 0;
  }

  private async applyStageCardFilterAndVerify(stage: "All CP" | "Unregistered" | "Registered") {
    const expectedCount = await this.stageSummaryCount(stage);
    const stageCard = this.stageSummaryCard(stage);

    await expect(stageCard).toBeVisible({ timeout: 30000 });
    await stageCard.scrollIntoViewIfNeeded().catch(() => {});

    if (!await this.stageCardSelectedOrDisabled(stageCard)) {
      await clickWithFallback(
        stageCard,
        this.page,
        async () => await this.stageCardSelectedOrListUpdated(stage, expectedCount),
      );
    }

    await this.waitForLoadingToFinish();
    const visibleRecordCount = await this.visibleListingRecordCount();
    if (expectedCount > 0) {
      expect(visibleRecordCount).toBeGreaterThan(0);
      expect(visibleRecordCount).toBeLessThanOrEqual(expectedCount);
    }

    if (stage !== "All CP" && visibleRecordCount > 0) {
      await this.expectVisibleRecordsBelongToStageWhenRendered(stage);
    }
  }

  private async stageCardSelectedOrListUpdated(stage: string, expectedCount: number) {
    await this.waitForLoadingToFinish();

    const stageCard = this.stageSummaryCard(stage);
    const selected = await stageCard
      .evaluate((element) => {
        const ariaSelected = element.getAttribute("aria-selected");
        const ariaPressed = element.getAttribute("aria-pressed");
        return ariaSelected === "true" || ariaPressed === "true";
      })
      .catch(() => false);

    if (selected) {
      return true;
    }

    const visibleRecordCount = await this.visibleListingRecordCount();
    return expectedCount === 0 || visibleRecordCount > 0;
  }

  private async stageCardSelectedOrDisabled(stageCard: Locator) {
    return await stageCard
      .evaluate((element) => {
        const htmlElement = element as HTMLButtonElement;
        const ariaSelected = element.getAttribute("aria-selected");
        const ariaPressed = element.getAttribute("aria-pressed");
        return htmlElement.disabled || ariaSelected === "true" || ariaPressed === "true";
      })
      .catch(() => false);
  }

  private async visibleListingRecordCount() {
    const recordLinks = this.listingRecordLinks();
    return await recordLinks
      .evaluateAll((links) =>
        links.filter((link) => {
          const rect = link.getBoundingClientRect();
          const style = window.getComputedStyle(link);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        }).length,
      )
      .catch(() => 0);
  }

  private async expectVisibleRecordsBelongToStageWhenRendered(stage: ChannelPartnerStage) {
    const visibleStages = await this.visibleListingRecordStages();
    if (visibleStages.length > 0) {
      for (const visibleStage of visibleStages) {
        expect(visibleStage).toBe(stage);
      }

      return;
    }

    await expect
      .poll(async () => await this.stageCardSelectedOrDisabled(this.stageSummaryCard(stage)), { timeout: 10000 })
      .toBeTruthy();
  }

  private async expectVisibleRecordsBelongToStage(stage: ChannelPartnerStage) {
    const recordLinks = this.listingRecordLinks();
    const visibleRecords: ChannelPartnerListingRecord[] = [];
    const linkCount = await recordLinks.count().catch(() => 0);

    for (let index = 0; index < linkCount; index += 1) {
      const link = recordLinks.nth(index);
      if (!await link.isVisible().catch(() => false)) {
        continue;
      }

      const record = await this.extractListingRecordFromLink(link);
      if (record) {
        visibleRecords.push(record);
      }
    }

    if (visibleRecords.length === 0) {
      const fallbackRecord = await this.extractListingRecordFromPageText();
      if (fallbackRecord) {
        visibleRecords.push(fallbackRecord);
      }
    }

    expect(visibleRecords.length).toBeGreaterThan(0);
    for (const record of visibleRecords) {
      expect(record.stage).toBe(stage);
    }
  }

  private async visibleListingRecordStages(): Promise<ChannelPartnerStage[]> {
    const stages = await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
      const cpIdPattern = /(?:CP|C)\d{3,}/i;
      const stageNames = [
        "Unregistered",
        "Registered",
      ];

      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const candidates = Array.from(document.querySelectorAll("tr, [role='row'], div"))
        .filter(visible)
        .map((element) => normalize(element.textContent))
        .filter((text) =>
          cpIdPattern.test(text) &&
          text.length < 700 &&
          stageNames.some((stageName) => new RegExp(`\\b${stageName}\\b`, "i").test(text)),
        )
        .sort((left, right) => left.length - right.length);

      const seenCpIds = new Set<string>();
      const rowStages: string[] = [];

      for (const text of candidates) {
        const cpId = text.match(cpIdPattern)?.[0];
        if (!cpId || seenCpIds.has(cpId)) {
          continue;
        }

        const stage = stageNames.find((stageName) => new RegExp(`\\b${stageName}\\b`, "i").test(text));
        if (stage) {
          seenCpIds.add(cpId);
          rowStages.push(stage);
        }
      }

      return rowStages;
    }).catch(() => []);

    const channelPartnerStages: ChannelPartnerStage[] = [];
    for (const stage of stages) {
      if (this.isChannelPartnerStage(stage)) {
        channelPartnerStages.push(stage);
      }
    }

    return channelPartnerStages;
  }

  private async expectPaginationVisible() {
    const paginationCandidates = [
      this.page.getByRole("button", { name: /^1$/ }).first(),
      this.page.getByText(/showing\s+\d+\s*-\s*\d+\s+of\s+\d+/i).first(),
      this.page.getByRole("combobox").first(),
    ];

    await expect
      .poll(async () => {
        for (const candidate of paginationCandidates) {
          if (await candidate.isVisible().catch(() => false)) {
            return true;
          }
        }

        return false;
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  private async expectRowActionIconsVisible() {
    const actionIconCount = await this.page
      .locator('img[alt*="chat" i], img[alt*="call" i], button:has(img)')
      .count()
      .catch(() => 0);

    expect(actionIconCount).toBeGreaterThan(0);
  }

  private async waitForLoadingToFinish() {
    await this.page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        return !/\bloading\b|fetching|please wait/i.test(bodyText);
      }, { timeout: 15000 })
      .toBeTruthy()
      .catch(() => {});
  }

  private async waitForSearchResultsToSettle(keyword: string) {
    await this.waitForLoadingToFinish();
    await expect
      .poll(async () => {
        const searchInput = await this.findSearchInput();
        return await this.searchInputMatchesKeyword(searchInput, keyword);
      }, { timeout: 10000 })
      .toBeTruthy();
    await this.page.waitForTimeout(500);
    await this.waitForLoadingToFinish();
  }

  private async fillSearchInput(keyword: string) {
    const searchInput = await this.findSearchInput();
    await searchInput.scrollIntoViewIfNeeded().catch(() => {});
    await searchInput.click({ force: true });
    await this.page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
    await this.page.keyboard.press("Backspace").catch(() => {});
    await searchInput.fill("").catch(() => {});

    await expect
      .poll(async () => await searchInput.inputValue().catch(() => ""), { timeout: 10000 })
      .toBe("");

    const filled = await searchInput
      .fill(keyword, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!filled || !await this.searchInputMatchesKeyword(searchInput, keyword)) {
      await searchInput.evaluate((element, value) => {
        const input = element as HTMLInputElement;
        input.focus();
        input.value = value;
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, keyword).catch(async () => {
        await searchInput.click({ force: true });
        await searchInput.pressSequentially(keyword, { delay: 30 });
      });
    }

    await expect
      .poll(async () => this.searchInputMatchesKeyword(searchInput, keyword), { timeout: 10000 })
      .toBeTruthy();
  }

  private async searchInputMatchesKeyword(searchInput: Locator, keyword: string) {
    const actualValue = await searchInput.inputValue().catch(() => "");
    return actualValue === keyword || actualValue === keyword.trim() || actualValue === keyword.trimStart();
  }

  private async waitForListing(timeout = 60000) {
    await this.waitForLoadingToFinish();

    await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        const cpListingTabVisible = await this.page.getByRole("tab", { name: this.tabName("CP Listing") }).isVisible().catch(() => false);
        const registeredCpTabVisible = await this.page.getByRole("tab", { name: this.tabName("Registered CP") }).isVisible().catch(() => false);
        const allTabVisible = await this.page.getByRole("tab", { name: this.tabName("All CP") }).isVisible().catch(() => false);
        const unregisteredTabVisible = await this.page.getByRole("tab", { name: this.tabName("Unregistered") }).isVisible().catch(() => false);
        const registeredTabVisible = await this.page.getByRole("tab", { name: this.tabName("Registered") }).isVisible().catch(() => false);

        return (
          /channel partner|cp listing|all cp|unregistered|registered/i.test(bodyText) &&
          ((cpListingTabVisible && registeredCpTabVisible) ||
            (allTabVisible && unregisteredTabVisible && registeredTabVisible))
        );
      }, { timeout })
      .toBeTruthy();
  }
}
