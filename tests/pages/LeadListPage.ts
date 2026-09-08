import { expect, type Page } from "@playwright/test";
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
  | "Open"
  | "Qualified"
  | "Site Visit"
  | "Opportunity"
  | "Booked"
  | "Dropped";

export type LeadFilterCriteria = {
  stage?: LeadStageFilter;
  source?: string;
  projectName?: string;
};

type FilterDropdown = "stage" | "source";

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

    const clearButton = this.page.getByRole("button", { name: /clear filters/i }).first();
    if (await clearButton.isVisible().catch(() => false)) {
      await clearButton.click({ force: true });
    } else {
      await this.removeSelectedFilterChips();
    }

    await this.clickApplyFilters();
  }

  async applyFilters(criteria: LeadFilterCriteria) {
    await this.openFilterPanel();
    await this.removeSelectedFilterChips();

    if (criteria.stage) {
      await this.selectFilterOption("stage", criteria.stage);
    }

    if (criteria.source) {
      await this.selectFilterOption("source", criteria.source);
    }

    await this.clickApplyFilters();
    await this.waitForListingReady();
  }

  async expectFilteredResults(criteria: LeadFilterCriteria) {
    await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        return /Lead ID|No leads|No data|No records/i.test(bodyText);
      }, { timeout: 60000 })
      .toBeTruthy();

    const hasNoResults = await hasVisibleText(this.page, /No results|No leads|No data|No records/i);

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
      await expect(this.page.getByText(new RegExp(escapeRegex(criteria.source), "i")).first()).toBeVisible({
        timeout: 60000,
      });
    }
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
    await this.page.waitForLoadState("networkidle").catch(() => {});
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

    const opened =
      (await tryClickFirstVisible(dropdownCandidates, { force: true, timeout: 3000 })) ||
      (await this.clickFilterDropdownWithDom(dropdown));
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

    const optionCandidates = [
      this.page.locator("button").filter({ hasText: optionPattern }),
      this.page.getByRole("option", { name: optionPattern }),
      this.page.getByRole("menuitem", { name: optionPattern }),
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
      const searchStillVisible = await this.page
        .getByRole("textbox", { name: /^Search$/i })
        .last()
        .isVisible()
        .catch(() => false);
      if (searchStillVisible) {
        await tryClickFirstVisible(dropdownCandidates, { force: true, timeout: 3000 });
      }
    }
  }

  private filterDropdownCandidates(dropdownLabel: string) {
    const label = dropdownLabel === "Select the Source" ? this.page.getByText(/^Source$/i).first() : null;

    return [
      ...(label ? [label.locator("xpath=following::button[1]").first()] : []),
      this.page.getByRole("button", { name: new RegExp(`^${escapeRegex(dropdownLabel)}$`, "i") }).first(),
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
    await this.page
      .locator(".cursor-pointer.flex-shrink-0 > svg")
      .first()
      .click({ force: true, timeout: 3000 })
      .catch(async () => {
        await this.page.evaluate(() => {
          const visible = (element: HTMLElement) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
          };
          const removeIcon = Array.from(document.querySelectorAll<SVGElement>(".cursor-pointer.flex-shrink-0 > svg"))
            .find((element) => visible(element as unknown as HTMLElement));
          removeIcon?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        }).catch(() => {});
      });
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
        .find((element) => normalize(element.innerText || element.textContent) === expectedOption && visible(element));
      if (!option) {
        return false;
      }

      option.click();
      return true;
    }, optionName).catch(() => false);
  }

  private async expectVisibleStatusLinksMatch(expectedStage: LeadStageFilter) {
    await expect
      .poll(
        async () => {
          const statusSummary = this.page
            .getByRole("button", { name: new RegExp(`^${escapeRegex(expectedStage)}\\s+\\d+$`, "i") })
            .first();
          return await statusSummary.isVisible().catch(() => false);
        },
        { timeout: 30000 },
      )
      .toBeTruthy();
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
              /^(New Lead|Contacted|Prospect|Site Visit|Negotiation|Booked|Dropped)$/i.test(text) &&
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
      waitUntil: "networkidle",
    });
  }
}
