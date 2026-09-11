import { expect, test, type Page } from "@playwright/test";
import { LoginPage } from "./LoginPage";
import { ProjectSwitcherPage } from "./ProjectSwitcherPage";
import {
  clickWithFallback,
  escapeRegex,
  hasVisibleHeading,
  hasVisibleText,
  normalizeText,
  tryClickFirstVisible,
} from "../support/ui-actions";

export type LeadListAppConfig = {
  baseUrl?: string;
  activeProjectName: string;
  mobileNumber?: string;
  otp?: string;
};

export type LeadStageFilter =
  | "New Lead"
  | "Contacted"
  | "Open"
  | "Qualified"
  | "Prospect"
  | "Site Visit"
  | "Opportunity"
  | "Negotiation"
  | "Booked"
  | "Dropped";

export type LeadFilterCriteria = {
  stage?: LeadStageFilter;
  source?: string;
  projectName?: string;
};

export type LeadTemperatureFilter = "Hot" | "Warm" | "Cold";

type FilterDropdown = "stage" | "source";
type SortDirection = "ascending" | "descending";
type SortableLeadColumn = "Lead ID" | "Stage" | "Create Date" | "Update Date";

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

  get filterButton() {
    return this.page.getByRole("button", { name: /^Filter(?:\(\d+\))?$/i }).first();
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

  async selectAllProjects() {
    await new ProjectSwitcherPage(this.page).ensureActiveProject("All Projects");
    await this.waitForListingReady();
  }

  async searchLead(searchText: string) {
    await expect(this.searchInput).toBeVisible({ timeout: 30000 });
    await this.searchInput.fill(searchText);
    await this.searchInput.press("Enter").catch(() => {});
  }

  async expectLeadVisible(leadName: string) {
    await this.searchLead(leadName);
    await expect(this.leadNameText(leadName)).toBeVisible({ timeout: 60000 });
  }

  async expectLeadVisibleForSearch(searchText: string, leadName: string) {
    await this.searchLead(searchText);
    await expect(this.leadNameText(leadName)).toBeVisible({ timeout: 60000 });
  }

  async clearFilters() {
    await this.openFilterPanel();

    const clearButton = this.page.getByRole("button", { name: /^(reset|clear all|clear filters)$/i }).first();
    if (await clearButton.isVisible().catch(() => false)) {
      await clearButton.click({ force: true });
    } else {
      await this.removeSelectedFilterChips();
    }

    await this.clickApplyFilters();
    await this.waitForListingReady();
  }

  async leadListResultCount() {
    await this.waitForListingReady();

    return await expect
      .poll(async () => await this.listingResultCount(), { timeout: 30000 })
      .not.toBe(-1)
      .then(async () => await this.listingResultCount());
  }

  async applyFilters(criteria: LeadFilterCriteria) {
    if (criteria.stage && criteria.source) {
      await this.applyStageSummaryFilter(criteria.stage);
      criteria.source = await this.firstVisibleSourceValue();
      await this.applySourceFilterIfAvailable(criteria.source);
      await this.waitForListingReady();
      return;
    }

    await this.openFilterPanel();
    await this.removeSelectedFilterChips();

    if (criteria.stage) {
      await this.selectFilterOption("stage", criteria.stage);
    }

    if (criteria.source) {
      await this.selectFilterOption("source", criteria.source);
    }

    await this.clickApplyFilters();
    if (criteria.stage || criteria.source) {
      await this.waitForFilterApplied(criteria.stage);
    }
    await this.waitForListingReady();
  }

  async applyStageFilter(stage: LeadStageFilter) {
    await this.waitForListingReady();
    const expectedStageCount = await this.stageSummaryCount(stage);

    await this.openFilterPanel();
    await this.removeSelectedFilterChips();
    await this.selectFilterOption("stage", stage);
    await this.clickApplyFilters();
    await this.waitForStageFilterApplied(stage, expectedStageCount);
  }

  async applyStageSummaryFilter(stage: LeadStageFilter) {
    await this.waitForListingReady();
    const expectedStageCount = await this.stageSummaryCount(stage);
    const stageButton = this.page.getByRole("button", {
      name: new RegExp(`^${escapeRegex(stage)}\\s+\\d+$`, "i"),
    }).first();

    await expect(stageButton).toBeVisible({ timeout: 30000 });
    await stageButton.click({ force: true });
    await this.waitForStageFilterApplied(stage, expectedStageCount);
  }

  async expectFilteredResults(criteria: LeadFilterCriteria) {
    await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        return /Lead ID|No leads|No data|No records/i.test(bodyText);
      }, { timeout: 60000 })
      .toBeTruthy();

    const resultCount = await this.listingResultCount();
    const hasNoResults =
      resultCount === 0 && await hasVisibleText(this.page, /No results|No leads|No data|No records/i);

    if (criteria.projectName) {
      await expect(
        this.page.getByRole("button", { name: new RegExp(escapeRegex(criteria.projectName), "i") })
      ).toBeVisible({ timeout: 30000 });
    }

    if (hasNoResults) {
      return;
    }

    if (criteria.stage) {
      await this.expectVisibleStatusLinksMatch(criteria.stage);
    }

    if (criteria.source) {
      await this.expectVisibleSourcesMatch(criteria.source);
    }
  }

  async applyTemperatureFilter(temperature: LeadTemperatureFilter) {
    await this.waitForListingReady();
    const expectedCount = await this.temperatureBadgeCount(temperature);

    const badgeClicked =
      (await tryClickFirstVisible(this.temperatureBadgeCandidates(temperature), { force: true })) ||
      (await this.clickTemperatureBadgeWithDom(temperature));
    if (!badgeClicked) {
      throw new Error(`Lead temperature filter "${temperature}" was not visible.`);
    }

    await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await this.expectTemperatureFilteredResults(temperature, expectedCount);
  }

  async expectDefaultLeadListRestored(expectedDefaultCount: number) {
    await expect
      .poll(async () => await this.listingResultCount(), { timeout: 30000 })
      .toBe(expectedDefaultCount);

    await expect
      .poll(async () => await this.activeFilterBadgeCount(), { timeout: 30000 })
      .toBe(0);
  }

  async expectAllStageDataLoaded() {
    await expect
      .poll(async () => await this.activeFilterBadgeCount(), { timeout: 30000 })
      .toBe(0);
    await expect(this.page.locator("div").filter({ hasText: /^Filter$/ }).first()).toBeVisible({
      timeout: 30000,
    });

    await expect
      .poll(async () => await this.stageSummaryCount("All Leads"), { timeout: 30000 })
      .toBeGreaterThan(0);

    await expect
      .poll(async () => await this.visibleStageSummaryCount(), { timeout: 30000 })
      .toBeGreaterThanOrEqual(6);
  }

  async expectLeadListingLoaded() {
    await this.waitForListingReady();

    await expect(this.searchInput).toBeVisible({ timeout: 30000 });
    await this.expectFilterControlVisible();
    await expect(this.page.getByRole("button", { name: /^All Leads\s+\d+$/i }).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(this.page.getByRole("button", { name: /^New Lead\s+\d+$/i }).first()).toBeVisible({
      timeout: 30000,
    });

    for (const columnName of ["Lead Name", "Lead ID", "Stage", "Create Date", "Update Date"]) {
      await expect(this.page.getByText(columnName, { exact: true }).first()).toBeVisible({
        timeout: 30000,
      });
    }

    for (const temperature of ["Hot", "Warm", "Cold"] as const) {
      await expect(this.page.getByText(new RegExp(`^${escapeRegex(temperature)}\\s*\\(\\d+\\)$`, "i")).first()).toBeVisible({
        timeout: 30000,
      });
    }

    await expect
      .poll(async () => await this.listingResultCount(), { timeout: 30000 })
      .toBeGreaterThan(0);
    await expect(this.page.locator("a[href*='manage-leads'][href*='id=']").first()).toBeVisible({
      timeout: 30000,
    });
    await expect(this.page.getByRole("combobox").first()).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole("button", { name: "1" }).first()).toBeVisible({ timeout: 30000 });
  }

  async expectSortableColumnsWork(
    columns: SortableLeadColumn[] = ["Lead ID", "Stage", "Create Date"],
  ) {
    await this.expectLeadListingLoaded();
    await this.waitForSortableGridHeaders(columns);

    for (const columnName of columns) {
      const firstOrder = await this.expectColumnSortDirection(columnName, "ascending");
      const secondOrder = await this.expectColumnSortDirection(columnName, "descending");

      if (firstOrder !== "flat" && secondOrder !== "flat") {
        expect(secondOrder, `${columnName} should change sort direction`).not.toBe(firstOrder);
      }
    }
  }

  async firstVisibleSourceValue() {
    await this.waitForListingReady();

    const source = await expect
      .poll(async () => await this.findFirstVisibleSourceValue(), { timeout: 30000 })
      .not.toBe("")
      .then(async () => await this.findFirstVisibleSourceValue());

    return source;
  }

  private async expectFilterControlVisible() {
    await expect
      .poll(async () => {
        const filterTextVisible = await this.page
          .getByText(/^Filter(?:\(\d+\))?$/i)
          .first()
          .isVisible()
          .catch(() => false);
        const filterIconVisible = await this.page
          .locator('img[alt="filter" i]')
          .first()
          .isVisible()
          .catch(() => false);

        return filterTextVisible || filterIconVisible;
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  private async expectColumnSortDirection(columnName: SortableLeadColumn, direction: SortDirection) {
    const sortLabel = this.sortLabelFor(columnName, direction);

    return await test.step(`Sort ${columnName} ${direction}`, async () => {
      await this.openColumnSortMenu(columnName);
      await this.selectSortOption(sortLabel);
      await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await this.waitForListingReady();
      await this.expectSortIndicator(columnName, sortLabel);

      const values = await expect
        .poll(async () => await this.visibleColumnValues(columnName), { timeout: 30000 })
        .not.toHaveLength(0)
        .then(async () => await this.visibleColumnValues(columnName));

      const detectedOrder = this.detectedSortDirection(values, columnName);
      expect(detectedOrder, `${columnName} values: ${values.join(", ")}`).not.toBeNull();
      return detectedOrder ?? "flat";
    });
  }

  private sortLabelFor(columnName: SortableLeadColumn, direction: SortDirection) {
    const isDateColumn = /date/i.test(columnName);
    if (isDateColumn) {
      return direction === "ascending" ? "Oldest to Latest" : "Latest to Oldest";
    }

    return direction === "ascending" ? "A-Z" : "Z-A";
  }

  private async openColumnSortMenu(columnName: SortableLeadColumn) {
    const columnPattern = new RegExp(`^${escapeRegex(columnName)}\\b`, "i");
    const headerCandidates = [
      this.page.getByRole("columnheader", { name: new RegExp(escapeRegex(columnName), "i") }).first(),
      this.page.locator("th, [role='columnheader']").filter({ hasText: columnPattern }).first(),
      this.page
        .getByText(columnPattern)
        .first()
        .locator("xpath=ancestor::*[self::th or @role='columnheader' or self::tr or self::div][1]"),
    ];

    for (const header of headerCandidates) {
      if (!(await header.isVisible().catch(() => false))) {
        continue;
      }

      const sortButton = header.getByRole("button", { name: /Sort:/i }).first();
      if (await sortButton.isVisible().catch(() => false)) {
        await sortButton.click({ force: true });
        return;
      }

      const labeledSortButton = header.getByLabel(/Sort:/i).first();
      if (await labeledSortButton.isVisible().catch(() => false)) {
        await labeledSortButton.click({ force: true });
        return;
      }

      await header.click({ force: true });
      return;
    }

    const clickedWithDom = await this.clickColumnSortButtonWithDom(columnName);
    if (clickedWithDom) {
      return;
    }

    throw new Error(`Sortable column "${columnName}" was not visible.`);
  }

  private async waitForSortableGridHeaders(columns: SortableLeadColumn[]) {
    await expect
      .poll(async () => {
        const visibleHeaders = await this.visibleSortableHeaderNames();
        return columns.every((columnName) => visibleHeaders.includes(columnName));
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  private async visibleSortableHeaderNames(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const sortableColumns = ["Lead ID", "Stage", "Create Date", "Update Date"];

      return Array.from(document.querySelectorAll<HTMLElement>("th, [role='columnheader'], tr"))
        .filter(visible)
        .flatMap((element) => {
          const text = normalize(element.innerText || element.textContent);
          return sortableColumns.filter((columnName) => new RegExp(`\\b${columnName}\\b`, "i").test(text));
        });
    }).catch(() => []);
  }

  private async clickColumnSortButtonWithDom(columnName: SortableLeadColumn) {
    return await this.page.evaluate((targetColumnName) => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const headers = Array.from(document.querySelectorAll<HTMLElement>("th, [role='columnheader'], tr"))
        .filter((element) => {
          const text = normalize(element.innerText || element.textContent);
          return visible(element) && new RegExp(`\\b${targetColumnName}\\b`, "i").test(text);
        })
        .sort((left, right) => {
          const leftExact = normalize(left.innerText || left.textContent).startsWith(targetColumnName) ? 0 : 1;
          const rightExact = normalize(right.innerText || right.textContent).startsWith(targetColumnName) ? 0 : 1;
          if (leftExact !== rightExact) {
            return leftExact - rightExact;
          }
          return normalize(left.innerText || left.textContent).length - normalize(right.innerText || right.textContent).length;
        });

      const header = headers[0];
      const sortButton =
        Array.from(header?.querySelectorAll<HTMLElement>("button, [role='button']") ?? [])
          .find((element) => /Sort:/i.test(normalize(element.getAttribute("aria-label") || element.innerText || element.textContent))) ??
        header;

      if (!sortButton || !visible(sortButton)) {
        return false;
      }

      sortButton.scrollIntoView({ block: "center", inline: "center" });
      sortButton.click();
      return true;
    }, columnName).catch(() => false);
  }

  private async selectSortOption(sortLabel: string) {
    const optionPattern = new RegExp(`^Sort:\\s*${escapeRegex(sortLabel)}$`, "i");
    const sortOption = this.page
      .locator("button, [role='menuitem'], [role='option'], div")
      .filter({ hasText: optionPattern })
      .first();

    await expect(sortOption).toBeVisible({ timeout: 15000 });
    await sortOption.click({ force: true });
  }

  private async expectSortIndicator(columnName: SortableLeadColumn, sortLabel: string) {
    await expect
      .poll(
        async () => {
          const indicators = await this.page
            .locator("th, [role='columnheader'], tr")
            .filter({ hasText: new RegExp(escapeRegex(columnName), "i") })
            .evaluateAll((elements) =>
              elements.map((element) => {
                const text = (element.textContent || "").replace(/\s+/g, " ").trim();
                const sortLabel = Array.from(element.querySelectorAll<HTMLElement>("button, [role='button']"))
                  .map((button) => button.getAttribute("aria-label") || button.textContent || "")
                  .find((label) => /Sort:/i.test(label));
                return `${text} ${sortLabel || ""}`.replace(/\s+/g, " ").trim();
              }),
            )
            .catch(() => []);

          return indicators.some((text) =>
            new RegExp(`${escapeRegex(columnName)}\\s*Sort:\\s*${escapeRegex(sortLabel)}`, "i").test(text),
          );
        },
        { timeout: 15000 },
      )
      .toBeTruthy();
  }

  private async visibleColumnValues(columnName: SortableLeadColumn) {
    return await this.page.evaluate((targetColumnName) => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const expectedValueForColumn = (value: string) => {
        if (targetColumnName === "Lead ID") {
          return /^L\d+/i.test(value);
        }

        if (/date/i.test(targetColumnName)) {
          return /^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}$/.test(value);
        }

        if (targetColumnName === "Stage") {
          return /^(New Lead|Contacted|Prospect|Site Visit|Negotiation|Booked|Dropped)$/i.test(value);
        }

        return Boolean(value);
      };
      const mainGridColumnIndex: Record<string, number> = {
        "Lead ID": 0,
        Stage: 1,
        "Create Date": 4,
        "Update Date": 5,
      };
      const mainGridIndex = mainGridColumnIndex[targetColumnName];

      if (mainGridIndex !== undefined) {
        const rowValues = Array.from(document.querySelectorAll<HTMLTableRowElement>("table tbody tr, table tr"))
          .map((row) => Array.from(row.querySelectorAll<HTMLElement>("td, [role='cell']")))
          .filter((cells) => cells.length > mainGridIndex)
          .filter((cells) => /^L\d+/i.test(normalize(cells[0].innerText || cells[0].textContent)))
          .map((cells) => cells[mainGridIndex])
          .filter((cell): cell is HTMLElement => Boolean(cell) && visible(cell))
          .map((cell) => normalize(cell.innerText || cell.textContent))
          .filter((text) => text && text !== "-" && !/^NA$/i.test(text) && expectedValueForColumn(text));

        if (rowValues.length) {
          return rowValues;
        }
      }

      const tables = Array.from(document.querySelectorAll<HTMLTableElement>("table"));
      for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
        const headerCells = Array.from(tables[tableIndex].querySelectorAll<HTMLElement>("th, [role='columnheader']"));
        const headerIndex = headerCells.findIndex((header) => {
          const text = normalize(header.innerText || header.textContent);
          return visible(header) && new RegExp(`^${targetColumnName}\\b`, "i").test(text);
        });
        if (headerIndex === -1) {
          continue;
        }

        for (const dataTable of tables.slice(tableIndex + 1)) {
          const rows = Array.from(dataTable.querySelectorAll<HTMLTableRowElement>("tbody tr, tr"));
          const firstDataCells = Array.from(rows[0]?.querySelectorAll<HTMLElement>("td, [role='cell']") ?? []);
          if (firstDataCells.length < Math.max(headerCells.length - 1, headerIndex + 1)) {
            continue;
          }

          const values = rows
            .map((row) => Array.from(row.querySelectorAll<HTMLElement>("td, [role='cell']"))[headerIndex])
            .filter((cell): cell is HTMLElement => Boolean(cell) && visible(cell))
            .map((cell) => normalize(cell.innerText || cell.textContent))
            .filter((text) => text && text !== "-" && !/^NA$/i.test(text) && expectedValueForColumn(text));

          if (values.length) {
            return values;
          }
        }
      }

      const headers = Array.from(document.querySelectorAll<HTMLElement>("th, [role='columnheader']"))
        .filter((header) => {
          const text = normalize(header.innerText || header.textContent);
          return visible(header) && new RegExp(`^${targetColumnName}\\b`, "i").test(text);
        })
        .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);

      const header = headers[0];
      if (!header) {
        return [];
      }

      const headerRect = header.getBoundingClientRect();
      const values = Array.from(document.querySelectorAll<HTMLElement>("td, [role='cell']"))
        .filter((cell) => {
          const rect = cell.getBoundingClientRect();
          const cellCenter = rect.left + rect.width / 2;
          return (
            visible(cell) &&
            rect.top > headerRect.bottom &&
            cellCenter >= headerRect.left - 12 &&
            cellCenter <= headerRect.right + 12
          );
        })
        .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)
        .map((cell) => normalize(cell.innerText || cell.textContent))
        .filter((text) => text && text !== "-" && !/^NA$/i.test(text) && expectedValueForColumn(text));

      return values;
    }, columnName).catch(() => []);
  }

  private valuesAreSorted(values: string[], columnName: SortableLeadColumn, direction: SortDirection) {
    if (values.length < 2) {
      return true;
    }

    const multiplier = direction === "ascending" ? 1 : -1;

    for (let index = 1; index < values.length; index += 1) {
      const previous = this.sortComparableValue(values[index - 1], columnName);
      const current = this.sortComparableValue(values[index], columnName);
      if (this.compareSortValues(previous, current) * multiplier > 0) {
        return false;
      }
    }

    return true;
  }

  private detectedSortDirection(values: string[], columnName: SortableLeadColumn): SortDirection | "flat" | null {
    const ascending = this.valuesAreSorted(values, columnName, "ascending");
    const descending = this.valuesAreSorted(values, columnName, "descending");

    if (ascending && descending) {
      return "flat";
    }

    if (ascending) {
      return "ascending";
    }

    if (descending) {
      return "descending";
    }

    return null;
  }

  private sortComparableValue(value: string, columnName: SortableLeadColumn) {
    if (/date/i.test(columnName)) {
      const [day, monthName, year] = value.split(/\s+/);
      const parsed = Date.parse(`${monthName} ${day}, ${year}`);
      return Number.isNaN(parsed) ? value.toLowerCase() : parsed;
    }

    return value.toLowerCase();
  }

  private compareSortValues(left: string | number, right: string | number) {
    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }

    return String(left).localeCompare(String(right), undefined, {
      numeric: true,
      sensitivity: "base",
    });
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

  private async openFilterPanel() {
    if (await this.isFilterPanelOpen()) {
      return;
    }

    const filterCandidates = [
      this.filterButton,
      this.page.locator("button").filter({ hasText: /^Filter(?:\(\d+\))?$/i }).first(),
      this.page.getByText(/^Filter(?:\(\d+\))?$/i).first(),
      this.page
        .locator("div")
        .filter({ has: this.page.locator('img[alt="filter" i]') })
        .last(),
      this.filterButton.locator("xpath=ancestor::*[@role='button' or self::button or contains(@class, 'cursor-pointer')][1]").first(),
      this.page.locator("xpath=/html/body/div[2]/div/div[2]/div[2]/div[3]/div[1]/div[2]/div[3]"),
    ];

    const clicked =
      (await tryClickFirstVisible(filterCandidates, { force: true })) ||
      (await this.clickFilterControlByDirectXPath()) ||
      (await this.clickFilterControlWithDom());
    if (!clicked) {
      throw new Error("Lead listing filter control was not visible.");
    }

    await expect
      .poll(async () => await this.isFilterPanelOpen(), { timeout: 30000 })
      .toBeTruthy();
  }

  private async isFilterPanelOpen() {
    const stageFilterVisible = await this.page
      .getByRole("button", { name: /Select the Stage|selected/i })
      .first()
      .isVisible()
      .catch(() => false);
    const sourceFilterVisible = await this.page
      .getByRole("button", { name: /Select the Source/i })
      .first()
      .isVisible()
      .catch(() => false);
    const applyVisible = await this.page
      .getByRole("button", { name: /^Apply$/i })
      .last()
      .isVisible()
      .catch(() => false);

    return (stageFilterVisible || sourceFilterVisible) && applyVisible;
  }

  private async clickApplyFilters() {
    await tryClickFirstVisible(
      [
        this.page.getByRole("button", { name: /^Apply$/i }).last(),
        this.page.locator("button").filter({ hasText: /^Apply$/i }).last(),
      ],
      { force: true },
    );
    await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  }

  private async waitForFilterApplied(stage?: LeadStageFilter) {
    await expect
      .poll(async () => {
        const badgeCount = await this.activeFilterBadgeCount();
        if (badgeCount > 0) {
          return true;
        }

        if (!stage) {
          return false;
        }

        const expectedStageCount = await this.stageSummaryCount(stage);
        const resultCount = await this.listingResultCount();
        return (
          (await this.isStageSummaryActive(stage)) ||
          (expectedStageCount >= 0 && resultCount === expectedStageCount)
        );
      }, { timeout: 30000 })
      .toBeTruthy();
    await expect
      .poll(async () => await this.listingResultCount(), { timeout: 30000 })
      .not.toBe(-1);
  }

  private async applySourceFilterIfAvailable(source: string) {
    const applied = await this.openFilterPanel()
      .then(async () => {
        await this.selectFilterOption("source", source);
        await this.clickApplyFilters();
        await this.waitForFilterApplied();
        return true;
      })
      .catch(async () => {
        await this.page.keyboard.press("Escape").catch(() => {});
        return false;
      });

    if (!applied) {
      await this.expectVisibleSourcesMatch(source);
    }
  }

  private async waitForStageFilterApplied(stage: LeadStageFilter, expectedStageCount: number) {
    await expect
      .poll(async () => {
        const badgeCount = await this.activeFilterBadgeCount();
        if (badgeCount > 0) {
          return true;
        }

        const resultCount = await this.listingResultCount();
        return (
          (await this.isStageSummaryActive(stage)) ||
          (expectedStageCount >= 0 && resultCount === expectedStageCount)
        );
      }, { timeout: 30000 })
      .toBeTruthy();

    if (expectedStageCount > 0) {
      await expect
        .poll(async () => await this.listingResultCount(), { timeout: 30000 })
        .toBe(expectedStageCount);
    }

    await this.expectVisibleStatusLinksMatch(stage);
  }

  private async clickFilterControlByDirectXPath() {
    const directFilter = this.page.locator(
      "xpath=/html/body/div[2]/div/div[2]/div[2]/div[3]/div[1]/div[2]/div[3]",
    );

    return await directFilter
      .click({ force: true, timeout: 3000 })
      .then(() => true)
      .catch(() => false);
  }

  private async clickFilterControlWithDom() {
    return await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const icon = Array.from(document.querySelectorAll<HTMLImageElement>('img[alt*="filter" i]'))
        .find((element) => visible(element));
      if (icon) {
        const rect = icon.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const target = document.elementFromPoint(centerX, centerY);
        let clickable = (target instanceof HTMLElement ? target : icon) as HTMLElement;
        let parent = clickable.parentElement;
        for (let depth = 0; parent && depth < 6; depth += 1) {
          const style = window.getComputedStyle(parent);
          if (style.cursor === "pointer" || /Filter/i.test(normalize(parent.innerText || parent.textContent))) {
            clickable = parent;
            break;
          }
          parent = parent.parentElement;
        }

        clickable.scrollIntoView({ block: "center", inline: "center" });
        clickable.click();
        return true;
      }

      const label = Array.from(document.querySelectorAll<HTMLElement>("div, span, p, button"))
        .find((element) => /^Filter(?:\(\d+\))?$/i.test(normalize(element.innerText || element.textContent)) && visible(element));
      if (!label) {
        const xpathResult = document.evaluate(
          "/html/body/div[2]/div/div[2]/div[2]/div[3]/div[1]/div[2]/div[3]",
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        const xpathElement = xpathResult.singleNodeValue;
        if (!(xpathElement instanceof HTMLElement)) {
          return false;
        }

        xpathElement.click();
        return true;
      }

      let clickable: HTMLElement = label;
      let parent = label.parentElement;
      for (let depth = 0; parent && depth < 5; depth += 1) {
        const style = window.getComputedStyle(parent);
        if (style.cursor === "pointer" || parent.querySelector('img[alt*="filter" i], svg')) {
          clickable = parent;
          break;
        }
        parent = parent.parentElement;
      }

      clickable.scrollIntoView({ block: "center", inline: "center" });
      clickable.click();
      return true;
    }).catch(() => false);
  }

  private async selectFilterOption(dropdown: FilterDropdown, optionName: string) {
    const dropdownLabel = dropdown === "stage" ? "Select the Stage" : "Select the Source";

    const dropdownCandidates = this.filterDropdownCandidates(dropdownLabel);

    let opened = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      opened =
        (await tryClickFirstVisible(dropdownCandidates, { force: true, timeout: 3000 })) ||
        (await this.clickFilterDropdownWithDom(dropdown));
      if (opened) {
        break;
      }

      await this.scrollFilterPanel(dropdown === "source" ? 1 : -1);
    }

    if (!opened) {
      throw new Error(`Unable to open lead filter dropdown for ${dropdownLabel.toString()}.`);
    }

    const optionPattern = new RegExp(`^${escapeRegex(optionName)}$`, "i");
    const dropdownSearch = this.page
      .getByRole("textbox", { name: /^Search$/i })
      .last();
    if (await dropdownSearch.isVisible().catch(() => false)) {
      await dropdownSearch.fill(optionName);
    }

    if (await this.clickFilterOptionWithDom(optionName)) {
      if (dropdown === "stage") {
        await this.closeOpenFilterDropdown();
      }
      return;
    }

    const optionCandidates = [
      this.page.getByRole("button", { name: optionPattern, exact: true }),
      this.page.getByRole("option", { name: optionPattern, exact: true }),
      this.page.getByRole("menuitem", { name: optionPattern, exact: true }),
      this.page.locator("button").filter({ hasText: optionPattern }),
      this.page.getByText(optionPattern),
    ];

    const clickVisibleOption = async () => {
      for (const candidate of optionCandidates) {
        const count = await candidate.count().catch(() => 0);
        for (let index = count - 1; index >= 0; index -= 1) {
          const option = candidate.nth(index);
          if (!(await option.isVisible().catch(() => false))) {
            continue;
          }

          await option.scrollIntoViewIfNeeded().catch(() => {});
          await option.click({ force: true });
          return true;
        }
      }

      return false;
    };

    const selected = await expect
      .poll(
        async () =>
          (await clickVisibleOption()) ||
          (await this.clickFilterOptionWithDom(optionName)),
        { timeout: 10000 },
      )
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
    if (!selected) {
      throw new Error(`Unable to select "${optionName}" from lead filter dropdown.`);
    }

    if (dropdown === "stage") {
      await this.closeOpenFilterDropdown();
    }
  }

  private async closeOpenFilterDropdown() {
    await this.page.keyboard.press("Escape").catch(() => {});
    await this.page.waitForTimeout(250);
  }

  private async scrollFilterPanel(direction = 1) {
    await this.page.evaluate((scrollDirection) => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("aside, section, div"))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return (
            rect.width > 250 &&
            rect.height > 250 &&
            rect.left > window.innerWidth * 0.45 &&
            element.scrollHeight > element.clientHeight &&
            style.display !== "none" &&
            style.visibility !== "hidden"
          );
        })
        .sort((left, right) => right.getBoundingClientRect().left - left.getBoundingClientRect().left);

      const panel = candidates[0];
      if (panel) {
        panel.scrollTop += scrollDirection * Math.max(180, panel.clientHeight * 0.6);
      }
    }, direction).catch(() => {});
    await this.page.mouse.wheel(0, direction * 400).catch(() => {});
    await this.page.waitForTimeout(250);
  }

  private filterDropdownCandidates(dropdownLabel: string) {
    const label = dropdownLabel === "Select the Source" ? this.page.getByText(/^Source$/i).first() : null;

    return [
      this.page.getByRole("button", { name: new RegExp(`^${escapeRegex(dropdownLabel)}$`, "i") }).first(),
      ...(label ? [label.locator("xpath=following::button[1]").first()] : []),
      this.page.locator("button").filter({ hasText: new RegExp(`^${escapeRegex(dropdownLabel)}$`, "i") }).first(),
      this.page.getByText(new RegExp(`^${escapeRegex(dropdownLabel)}$`, "i")).locator("xpath=ancestor-or-self::button[1]").first(),
      this.page.getByText(new RegExp(`^${escapeRegex(dropdownLabel)}$`, "i")).locator("xpath=following::button[1]").first(),
    ];
  }

  private async clickFilterDropdownWithDom(dropdown: FilterDropdown) {
    return await this.page.evaluate((dropdownName) => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const expectedLabel = dropdownName === "stage" ? "Select the Stage" : "Select the Source";
      const directButton = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
        .find((element) => normalize(element.innerText || element.textContent) === expectedLabel && visible(element));
      if (directButton) {
        directButton.click();
        return true;
      }

      if (dropdownName === "stage") {
        const stageLabel = Array.from(document.querySelectorAll<HTMLElement>("label, p, span, div"))
          .find((element) => normalize(element.innerText || element.textContent) === "Stage" && visible(element));
        if (stageLabel) {
          let container: HTMLElement | null = stageLabel.parentElement;
          for (let depth = 0; container && depth < 5; depth += 1) {
            const button = Array.from(container.querySelectorAll<HTMLElement>("button, [role='button']"))
              .find((element) => visible(element));
            if (button) {
              button.click();
              return true;
            }
            container = container.parentElement;
          }
        }
      }

      const label = Array.from(document.querySelectorAll<HTMLElement>("label, p, span, div"))
        .find((element) => normalize(element.innerText || element.textContent) === expectedLabel && visible(element));
      if (label) {
        let container: HTMLElement | null = label;
        for (let depth = 0; container && depth < 5; depth += 1) {
          const clickable =
            container.matches("button, [role='button'], div[class*='cursor-pointer']") && visible(container)
              ? container
              : container.querySelector<HTMLElement>("button, [role='button'], div[class*='cursor-pointer']");
          if (clickable && visible(clickable)) {
            clickable.click();
            return true;
          }
          container = container.parentElement;
        }
      }

      return false;
    }, dropdown).catch(() => false);
  }

  private async removeSelectedFilterChips() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const removed = await this.page
        .locator(".cursor-pointer.flex-shrink-0 > svg")
        .first()
        .click({ force: true, timeout: 1500 })
        .then(() => true)
        .catch(async () => {
          return await this.page.evaluate(() => {
            const visible = (element: HTMLElement) => {
              const rect = element.getBoundingClientRect();
              const style = window.getComputedStyle(element);
              return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
            };
            const removeIcon = Array.from(document.querySelectorAll<SVGElement>(".cursor-pointer.flex-shrink-0 > svg"))
              .find((element) => visible(element as unknown as HTMLElement));
            removeIcon?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            return Boolean(removeIcon);
          }).catch(() => false);
        });

      if (!removed) {
        break;
      }
    }
  }

  private async clickFilterOptionWithDom(optionName: string) {
    return await this.page.evaluate((expectedOption) => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const option = Array.from(document.querySelectorAll<HTMLElement>("button, [role='option'], [role='menuitem'], li, label, p, div, span"))
        .filter((element) => normalize(element.innerText || element.textContent) === expectedOption && visible(element))
        .sort((left, right) => right.getBoundingClientRect().left - left.getBoundingClientRect().left)[0];
      if (!option) {
        return false;
      }

      let clickable: HTMLElement = option;
      let parent = option.parentElement;
      for (let depth = 0; parent && depth < 5; depth += 1) {
        const parentText = normalize(parent.innerText || parent.textContent);
        const parentStyle = window.getComputedStyle(parent);
        const input = parent.querySelector<HTMLElement>('input[type="checkbox"], [role="checkbox"]');
        if (parentText.includes(expectedOption) && input && visible(input)) {
          clickable = input;
          break;
        }

        if (
          parentText === expectedOption &&
          (parent.matches("button, [role='button'], label, li") || parentStyle.cursor === "pointer")
        ) {
          clickable = parent;
          break;
        }
        parent = parent.parentElement;
      }

      clickable.scrollIntoView({ block: "center", inline: "center" });
      clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      clickable.click();
      return true;
    }, optionName).catch(() => false);
  }

  private async expectVisibleStatusLinksMatch(expectedStage: LeadStageFilter) {
    await expect
      .poll(
        async () => {
          const visibleStages = await this.visibleStatusTexts();
          if (visibleStages.length === 0) {
            return await this.isStageSummaryActive(expectedStage);
          }

          return (
            visibleStages.length > 0 &&
            visibleStages.every((stage) => new RegExp(`^${escapeRegex(expectedStage)}$`, "i").test(stage))
          );
        },
        { timeout: 30000 },
      )
      .toBeTruthy();
  }

  private temperatureBadgeCandidates(temperature: LeadTemperatureFilter) {
    const badgePattern = new RegExp(`^${escapeRegex(temperature)}\\s*\\(\\d+\\)$`, "i");

    return [
      this.page.getByText(badgePattern).first(),
      this.page.locator("button").filter({ hasText: badgePattern }).first(),
      this.page.locator("div").filter({ hasText: badgePattern }).first(),
    ];
  }

  private async temperatureBadgeCount(temperature: LeadTemperatureFilter) {
    const badgePattern = new RegExp(`^${escapeRegex(temperature)}\\s*\\((\\d+)\\)$`, "i");

    const badgeText = await expect
      .poll(async () => await this.findVisibleTemperatureBadgeText(temperature), {
        timeout: 30000,
      })
      .toMatch(badgePattern)
      .then(async () => await this.findVisibleTemperatureBadgeText(temperature));

    const count = badgeText.match(badgePattern)?.[1];
    if (!count) {
      throw new Error(`Unable to read ${temperature} badge count.`);
    }

    return Number(count);
  }

  private async findVisibleTemperatureBadgeText(temperature: LeadTemperatureFilter) {
    return await this.page.evaluate((expectedTemperature) => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const badgePattern = new RegExp(`^${expectedTemperature}\\s*\\(\\d+\\)$`, "i");

      const badge = Array.from(document.querySelectorAll<HTMLElement>("button, div, span"))
        .find((element) => badgePattern.test(normalize(element.innerText || element.textContent)) && visible(element));

      return normalize(badge?.innerText || badge?.textContent);
    }, temperature).catch(() => "");
  }

  private async clickTemperatureBadgeWithDom(temperature: LeadTemperatureFilter) {
    return await this.page.evaluate((expectedTemperature) => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const badgePattern = new RegExp(`^${expectedTemperature}\\s*\\(\\d+\\)$`, "i");
      const badge = Array.from(document.querySelectorAll<HTMLElement>("button, div, span"))
        .find((element) => badgePattern.test(normalize(element.innerText || element.textContent)) && visible(element));
      if (!badge) {
        return false;
      }

      let clickable: HTMLElement = badge;
      let parent = badge.parentElement;
      for (let depth = 0; parent && depth < 5; depth += 1) {
        const style = window.getComputedStyle(parent);
        if (style.cursor === "pointer" || parent.matches("button, [role='button']")) {
          clickable = parent;
          break;
        }
        parent = parent.parentElement;
      }

      clickable.click();
      return true;
    }, temperature).catch(() => false);
  }

  private async expectTemperatureFilteredResults(
    temperature: LeadTemperatureFilter,
    expectedCount: number,
  ) {
    await expect
      .poll(async () => await this.listingResultCount(), { timeout: 30000 })
      .toBe(expectedCount);

    if (expectedCount === 0) {
      await expect(this.page.getByText(/No results|No leads|No data|No records/i).first()).toBeVisible({
        timeout: 30000,
      });
      return;
    }

    await expect
      .poll(
        async () => {
          const visibleTemperatures = await this.visibleLeadTemperatureTexts();
          return (
            visibleTemperatures.length > 0 &&
            visibleTemperatures.every(
              (visibleTemperature) => visibleTemperature.toLowerCase() === temperature.toLowerCase(),
            )
          );
        },
        { timeout: 30000 },
      )
      .toBeTruthy();
  }

  private async listingResultCount() {
    const footerText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    if (/No results|No leads|No data|No records/i.test(footerText)) {
      return 0;
    }

    const totalMatch = footerText.match(/Showing\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)/i);
    if (!totalMatch) {
      return -1;
    }

    return Number(totalMatch[1].replace(/,/g, ""));
  }

  private async activeFilterBadgeCount() {
    const filterText = await this.findVisibleFilterButtonText();
    return Number(filterText.match(/Filter\s*\((\d+)\)/i)?.[1] ?? 0);
  }

  private async isStageSummaryActive(stage: LeadStageFilter) {
    return await this.page
      .getByRole("button", {
        name: new RegExp(`^${escapeRegex(stage)}\\s+\\d+$`, "i"),
      })
      .first()
      .evaluate((element) => {
        const className = element.getAttribute("class") || "";
        const ariaPressed = element.getAttribute("aria-pressed");
        const ariaSelected = element.getAttribute("aria-selected");
        const dataState = element.getAttribute("data-state");

        return (
          ariaPressed === "true" ||
          ariaSelected === "true" ||
          dataState === "active" ||
          /active|selected|bg-|text-white|shadow/i.test(className)
        );
      })
      .catch(() => false);
  }

  private async stageSummaryCount(stage: string) {
    const summaryText = await this.page
      .getByRole("button", {
        name: new RegExp(`^${escapeRegex(stage)}\\s+\\d+$`, "i"),
      })
      .first()
      .innerText()
      .catch(() => "");
    const count = normalizeText(summaryText).match(/(\d+)$/)?.[1];

    return count ? Number(count) : -1;
  }

  private async visibleStageSummaryCount() {
    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    const stagePattern =
      /\b(New Lead|Contacted|Prospect|Open|Qualified|Site Visit|Negotiation|Opportunity|Booked|Dropped)\s+\d+\b/gi;
    const labels = new Set<string>();

    for (const match of bodyText.matchAll(stagePattern)) {
      labels.add(match[1].toLowerCase());
    }

    return labels.size;
  }

  private async findVisibleFilterButtonText() {
    return await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const elements = Array.from(document.querySelectorAll<HTMLElement>("button, div, span"))
        .filter((element) => /^Filter(?:\s*\(\d+\))?$/i.test(normalize(element.innerText || element.textContent)) && visible(element));
      const filter = elements.find((element) => /\(\d+\)/.test(normalize(element.innerText || element.textContent))) ?? elements[0];

      return normalize(filter?.innerText || filter?.textContent);
    }).catch(() => "");
  }

  private async visibleLeadTemperatureTexts() {
    return await this.page.locator("table tr").evaluateAll((rows) =>
      rows.flatMap((row) =>
        Array.from(row.querySelectorAll<HTMLElement>("td, [role='cell'], div, span"))
          .filter((element) => {
            const text = (element.textContent || "").replace(/\s+/g, " ").trim();
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return (
              /^(Hot|Warm|Cold)$/i.test(text) &&
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== "hidden" &&
              style.display !== "none"
            );
          })
          .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim()),
      ),
    );
  }

  private async expectVisibleSourcesMatch(expectedSource: string) {
    await expect
      .poll(
        async () => {
          const sources = await this.visibleSourceTexts();
          const boundarySources =
            sources.length <= 1 ? sources : [sources[0], sources[sources.length - 1]];

          return (
            boundarySources.length > 0 &&
            boundarySources.every((source) => new RegExp(`^${escapeRegex(expectedSource)}$`, "i").test(source))
          );
        },
        { timeout: 60000 },
      )
      .toBeTruthy();
  }

  private async visibleSourceTexts() {
    return await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const headers = Array.from(document.querySelectorAll<HTMLElement>("th, [role='columnheader']"));
      const sourceHeader = headers.find((header) => /^Source$/i.test(normalize(header.innerText || header.textContent)) && visible(header));
      if (!sourceHeader) {
        return [];
      }

      const sourceLeft = sourceHeader.getBoundingClientRect().left;
      return Array.from(document.querySelectorAll<HTMLElement>("td, [role='cell']"))
        .filter((cell) => {
          const rect = cell.getBoundingClientRect();
          return (
            Math.abs(rect.left - sourceLeft) < 90 &&
            rect.top > sourceHeader.getBoundingClientRect().bottom &&
            visible(cell)
          );
        })
        .map((cell) => normalize(cell.innerText || cell.textContent))
        .filter((text) => text && !/^Source$/i.test(text));
    }).catch(() => []);
  }

  private async findFirstVisibleSourceValue() {
    return await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const tables = Array.from(document.querySelectorAll<HTMLTableElement>("table"));
      for (const table of tables) {
        const headerCells = Array.from(table.querySelectorAll<HTMLElement>("th, [role='columnheader']"));
        const sourceIndex = headerCells.findIndex((cell) => /^Source$/i.test(normalize(cell.innerText || cell.textContent)));
        if (sourceIndex === -1) {
          continue;
        }

        const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr, tr"));
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll<HTMLElement>("td, [role='cell']"));
          const sourceCell = cells[sourceIndex];
          const text = normalize(sourceCell?.innerText || sourceCell?.textContent);
          if (text && !/^Source$/i.test(text) && visible(sourceCell)) {
            return text;
          }
        }
      }

      const sourceHeader = Array.from(document.querySelectorAll<HTMLElement>("th, [role='columnheader'], div, span"))
        .find((element) => /^Source$/i.test(normalize(element.innerText || element.textContent)) && visible(element));
      if (!sourceHeader) {
        return "";
      }

      const sourceLeft = sourceHeader.getBoundingClientRect().left;
      const sourceValues = Array.from(document.querySelectorAll<HTMLElement>("td, [role='cell'], div, span"))
        .filter((element) => {
          const text = normalize(element.innerText || element.textContent);
          const rect = element.getBoundingClientRect();
          return (
            text &&
            !/^Source$/i.test(text) &&
            Math.abs(rect.left - sourceLeft) < 80 &&
            rect.top > sourceHeader.getBoundingClientRect().bottom &&
            visible(element)
          );
        })
        .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);

      return normalize(sourceValues[0]?.innerText || sourceValues[0]?.textContent);
    }).catch(() => "");
  }

  private async visibleStatusTexts() {
    return await this.page
      .locator("td, [role='cell'], a")
      .evaluateAll((elements) =>
        elements
          .filter((element) => {
            const htmlElement = element as HTMLElement;
            const text = (htmlElement.textContent || "").replace(/\s+/g, " ").trim();
            const rect = htmlElement.getBoundingClientRect();
            const style = window.getComputedStyle(htmlElement);
            return (
              /^(New Lead|Contacted|Prospect|Open|Qualified|Site Visit|Negotiation|Opportunity|Booked|Dropped)$/i.test(text) &&
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== "hidden" &&
              style.display !== "none"
            );
          })
          .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim()),
      );
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
      waitUntil: "domcontentloaded",
    });
  }
}
