import { expect, type Locator, type Page } from "@playwright/test";
import { ProjectSwitcherPage } from "./ProjectSwitcherPage";
import { ensureAuthenticatedSession } from "../support/session";
import { clickWithFallback, escapeRegex, normalizeText, tryClickFirstVisible } from "../support/ui-actions";

export type ChannelPartnerAppConfig = {
  baseUrl?: string;
  activeProjectName: string;
  mobileNumber?: string;
  otp?: string;
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
  href?: string;
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
      "New CP",
      "Open",
      "Qualified",
      "Site Visit",
      "Opportunity",
      "Onboarded",
      "Dropped",
    ]) {
      await expect(this.stageSummaryCard(stage)).toBeVisible({ timeout: 30000 });
    }
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

  async openListingRecordDetails(record: ChannelPartnerListingRecord) {
    await this.waitForListing();

    const recordLink = record.href
      ? this.page.locator(`a[href="${record.href}"]`).first()
      : this.page.getByRole("link", { name: new RegExp(escapeRegex(record.cpName), "i") })
        .or(this.page.locator("a").filter({ hasText: new RegExp(escapeRegex(record.cpName), "i") }))
        .first();

    await expect(recordLink).toBeVisible({ timeout: 30000 });
    await recordLink.scrollIntoViewIfNeeded().catch(() => {});
    await recordLink.click({ force: true });

    await expect
      .poll(async () => {
        const detailText = await this.currentDetailText();
        return detailText.includes(record.cpId) || detailText.includes(record.cpName);
      }, { timeout: 30000 })
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

  async search(keyword: string) {
    const searchKeyword = this.searchKeyword(keyword);
    await this.waitForListing();

    const searchInput = await this.findSearchInput();
    await searchInput.scrollIntoViewIfNeeded().catch(() => {});
    await searchInput.click({ force: true });
    await this.page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await this.page.keyboard.press("Backspace");

    await expect
      .poll(async () => await searchInput.inputValue().catch(() => ""), { timeout: 10000 })
      .toBe("");

    if (searchKeyword) {
      await searchInput.pressSequentially(searchKeyword, { delay: 30 });
    }

    await expect
      .poll(async () => this.searchInputMatchesKeyword(searchInput, searchKeyword), { timeout: 10000 })
      .toBeTruthy();

    await this.page.waitForTimeout(1200);
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

  private listingRecordLinks() {
    return this.page.locator('a[href*="/channel-partners/channel-partner-qualification"]').filter({ hasText: /\S/ });
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
        anchor.getAttribute("title") ||
          anchor.getAttribute("aria-label") ||
          anchor.textContent,
      );
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
      const legalEntityName = normalize(cellTexts[3] || legalEntityFromText);
      const entityType = normalize(cellTexts[4] || entityTypeMatch?.[0] || "");

      return {
        cpName,
        cpId,
        legalEntityName,
        entityType,
        stage,
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
    await this.page.waitForLoadState("networkidle").catch(() => {});
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
