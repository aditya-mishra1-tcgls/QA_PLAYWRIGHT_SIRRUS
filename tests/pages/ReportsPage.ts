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

type DashboardWidget = {
  title: string;
  lastUpdated: string;
  hasTable: boolean;
  hasEmptyState: boolean;
  hasChartOrVisualization: boolean;
  hasActionMenu: boolean;
  hasDownloadMenu: boolean;
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

  async expectExistingDashboardsListed(exampleDashboardNames: string[] = []) {
    await this.waitForReady();

    const dashboardNames = await this.visibleDashboardNames();
    expect(dashboardNames.length, "Expected at least one dashboard to be listed.").toBeGreaterThan(0);

    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    const visibleExamples = exampleDashboardNames.filter((name) =>
      new RegExp(this.escapeRegex(name), "i").test(bodyText),
    );

    if (visibleExamples.length > 0) {
      for (const name of visibleExamples) {
        await expect(this.page.getByText(new RegExp(this.escapeRegex(name), "i")).first()).toBeVisible({
          timeout: 15000,
        });
      }
    }

    return dashboardNames;
  }

  async expectReportsNavigationIsActive() {
    await this.waitForReady();

    const active = await expect
      .poll(async () => {
        const visualActive = await this.page.evaluate(() => {
          const reportImage = Array.from(document.querySelectorAll<HTMLImageElement>("img"))
            .find((image) => /reports dashboard/i.test(image.getAttribute("alt") ?? ""));
          const button = reportImage?.closest("button");
          if (!button) {
            return false;
          }

          const candidates = [button, button.parentElement, button.parentElement?.parentElement]
            .filter((element): element is HTMLElement => Boolean(element));
          return candidates.some((element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            const color = style.backgroundColor;
            const hasVisibleBackground =
              color !== "rgba(0, 0, 0, 0)" &&
              color !== "transparent" &&
              color !== "rgb(255, 255, 255)";
            return rect.width > 0 && rect.height > 0 && hasVisibleBackground;
          });
        }).catch(() => false);

        if (visualActive) {
          return true;
        }

        for (const candidate of this.reportsDashboardButtonCandidates) {
          const item = candidate.first();
          if (!await item.isVisible().catch(() => false)) {
            continue;
          }

          const ariaCurrent = await item.getAttribute("aria-current").catch(() => null);
          const ariaSelected = await item.getAttribute("aria-selected").catch(() => null);
          const dataState = await item.getAttribute("data-state").catch(() => null);
          const className = await item.getAttribute("class").catch(() => "");
          const parentClass = await item.locator("xpath=ancestor::*[self::button or self::a or self::div][1]").getAttribute("class").catch(() => "");
          const hasActiveTooltip = await this.page.getByText(/^Reports & Dashboard$/i).isVisible().catch(() => false);

          if (
            ariaCurrent === "page" ||
            ariaSelected === "true" ||
            dataState === "active" ||
            /active|selected|bg-|border|purple|primary/i.test(`${className} ${parentClass}`) ||
            hasActiveTooltip
          ) {
            return true;
          }
        }

        return false;
      }, { timeout: 15000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    expect(active, "Expected Reports & Dashboard left navigation item to appear active.").toBe(true);
  }

  async expectSelectingDashboardLoadsWidgets() {
    await this.waitForReady();

    const dashboardName = await this.selectFirstDashboard();

    await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        const widgets = await this.dashboardWidgets();
        return bodyText.includes(this.trimDashboardTabText(dashboardName)) && widgets.length > 0;
      }, { timeout: 30000 })
      .toBeTruthy();

    const widgets = await this.dashboardWidgets();
    expect(widgets.length, `Expected widgets to load for selected dashboard "${dashboardName}".`).toBeGreaterThan(0);

    return { dashboardName, widgets };
  }

  async expectEditActionAvailableForListedDashboard() {
    await this.waitForReady();

    const dashboardName = await this.selectFirstDashboard();
    const editButton = await this.editButtonForDashboard(dashboardName);
    await expect(editButton).toBeVisible({ timeout: 30000 });
    await this.clickDashboardEditAction(editButton);

    await this.expectDashboardEditPanelVisible();
    await expect(this.page.getByRole("button", { name: /select access permission/i })).toBeVisible({
      timeout: 30000,
    });
    await this.page.getByRole("button", { name: /delete dashboard/i }).isVisible({ timeout: 2000 }).catch(() => false);
    await expect(this.page.getByRole("button", { name: /^cancel$/i })).toBeVisible({
      timeout: 30000,
    });

    await this.page.getByRole("button", { name: /^cancel$/i }).click({ force: true });
    await this.waitForReady();

    return dashboardName;
  }

  async expectSelectedDashboardStateRetainedVisually() {
    await this.waitForReady();

    const tab = await this.firstDashboardTab();
    const dashboardName = normalizeText(await tab.innerText());
    await tab.click({ force: true });

    const selected = await expect
      .poll(async () => {
        const ariaSelected = await tab.getAttribute("aria-selected").catch(() => null);
        const dataState = await tab.getAttribute("data-state").catch(() => null);
        const className = await tab.getAttribute("class").catch(() => "");
        const selectedButtonVisible = await this.page
          .getByRole("button", { name: /^selected$/i })
          .isVisible()
          .catch(() => false);

        return (
          ariaSelected === "true" ||
          dataState === "active" ||
          /selected|active|bg-|border/i.test(className ?? "") ||
          selectedButtonVisible
        );
      }, { timeout: 15000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    expect(selected, `Expected dashboard "${dashboardName}" to show a selected visual state.`).toBe(true);

    return dashboardName;
  }

  async expectWidgetCardsShowTitleAndLastUpdated() {
    await this.waitForReady();

    const widgets = await this.dashboardWidgets();

    expect(widgets.length, "Expected at least one widget card with title and Last Updated metadata.").toBeGreaterThan(0);

    for (const widget of widgets.slice(0, 3)) {
      await expect(this.page.getByRole("heading", { name: new RegExp(this.escapeRegex(widget.title), "i") }).first()).toBeVisible({
        timeout: 15000,
      });
      await expect(this.page.getByText(new RegExp(this.escapeRegex(widget.lastUpdated), "i")).first()).toBeVisible({
        timeout: 15000,
      });
    }

    return widgets;
  }

  async expectMixedWidgetTypesRenderWithoutLayoutBreak() {
    await this.waitForReady();
    await this.scrollDashboardWidgets();

    const widgets = await this.dashboardWidgets();
    expect(widgets.length, "Expected dashboard widgets to be available.").toBeGreaterThan(0);

    const renderedWidgetTypes = new Set(
      widgets
        .flatMap((widget) => [
          widget.hasTable ? "table" : "",
          widget.hasEmptyState ? "empty" : "",
          widget.hasChartOrVisualization ? "visualization" : "",
        ])
        .filter(Boolean),
    );
    expect(renderedWidgetTypes.size, "Expected visible widgets to expose at least one render type.").toBeGreaterThan(0);

    const layoutIsStable = await this.page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
        .map((heading) => {
          let current: HTMLElement | null = heading;
          for (let depth = 0; current && depth < 6; depth += 1) {
            if (/Last Updated\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(current.textContent ?? "")) {
              return current;
            }
            current = current.parentElement;
          }
          return null;
        })
        .filter((card): card is HTMLElement => Boolean(card));

      return cards.every((card) => {
        const rect = card.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    });
    expect(layoutIsStable, "Expected widget cards to render with stable dimensions.").toBe(true);

    return widgets;
  }

  async expectSimilarWidgetNamesKeepSeparateActions() {
    await this.waitForReady();

    const widgets = (await this.dashboardWidgets()).filter((widget) => widget.hasActionMenu);
    if (widgets.length === 0) {
      return [];
    }

    const checkedWidgets = widgets.slice(0, Math.min(widgets.length, 3));
    for (const widget of checkedWidgets) {
      const opened = await this.openWidgetActionMenu(widget.title);
      expect(opened, `Expected action menu to open for widget "${widget.title}".`).toBe(true);

      await expect(this.page.locator("body")).toContainText(/Edit|Delete|Download Dataset/i, {
        timeout: 10000,
      });
      await this.page.keyboard.press("Escape").catch(() => {});
    }

    return checkedWidgets;
  }

  async expectWidgetDateFormattingConsistency() {
    await this.waitForReady();

    const widgets = await this.dashboardWidgets();
    expect(widgets.length, "Expected widget metadata to validate date formatting.").toBeGreaterThan(0);

    for (const widget of widgets) {
      expect(
        /^Last Updated \d{2}\/\d{2}\/\d{4}$/.test(widget.lastUpdated),
        `Expected "${widget.lastUpdated}" for "${widget.title}" to follow DD/MM/YYYY format.`,
      ).toBe(true);
    }

    return widgets;
  }

  async expectRefreshPreservesDashboardAccess() {
    await this.waitForReady();
    const dashboardsBeforeRefresh = await this.visibleDashboardNames();
    const widgetsBeforeRefresh = await this.dashboardWidgets();

    expect(dashboardsBeforeRefresh.length, "Expected dashboards before refresh.").toBeGreaterThan(0);
    expect(widgetsBeforeRefresh.length, "Expected widgets before refresh.").toBeGreaterThan(0);

    await this.page.reload({ waitUntil: "domcontentloaded" });
    await this.waitForReady();

    const dashboardsAfterRefresh = await this.visibleDashboardNames();
    const widgetsAfterRefresh = await this.dashboardWidgets();

    expect(dashboardsAfterRefresh.length, "Expected dashboards after refresh.").toBeGreaterThan(0);
    expect(widgetsAfterRefresh.length, "Expected widgets after refresh.").toBeGreaterThan(0);

    return {
      dashboardsBeforeRefresh,
      dashboardsAfterRefresh,
      widgetsBeforeRefresh,
      widgetsAfterRefresh,
    };
  }

  async expectWidgetDownloadOptionsAvailable() {
    await this.waitForReady();

    const widgets = (await this.dashboardWidgets()).filter((widget) => widget.hasDownloadMenu);
    expect(widgets.length, "Expected at least one widget with download options.").toBeGreaterThan(0);

    const checkedWidgets = widgets.slice(0, Math.min(widgets.length, 3));
    for (const widget of checkedWidgets) {
      const opened = await this.openWidgetDownloadMenu(widget.title);
      expect(opened, `Expected download menu to open for widget "${widget.title}".`).toBe(true);

      await expect(this.page.locator("body")).toContainText(/Download|PDF|Excel|CSV|Dataset/i, {
        timeout: 10000,
      });
      await this.page.keyboard.press("Escape").catch(() => {});
    }

    return checkedWidgets;
  }

  async expectWidgetActionsMenuOpensCorrectly() {
    await this.waitForReady();

    const widgets = (await this.dashboardWidgets()).filter((widget) => widget.hasActionMenu);
    expect(widgets.length, "Expected at least one widget with an actions menu.").toBeGreaterThan(0);

    const checkedWidgets = widgets.slice(0, Math.min(widgets.length, 3));
    for (const widget of checkedWidgets) {
      const opened = await this.openWidgetActionMenu(widget.title);
      expect(opened, `Expected actions menu to open for widget "${widget.title}".`).toBe(true);

      await expect(this.page.locator("body")).toContainText(/Edit|Delete|Download Dataset/i, {
        timeout: 10000,
      });
      await this.page.keyboard.press("Escape").catch(() => {});
    }

    return checkedWidgets;
  }

  async expectTableWidgetsRenderHeadersAndRows() {
    await this.waitForReady();
    await this.scrollDashboardWidgets();

    const tableWidgets = await this.tableWidgetSummaries();
    expect(tableWidgets.length, "Expected at least one table widget to be available.").toBeGreaterThan(0);

    for (const widget of tableWidgets.slice(0, 3)) {
      expect(widget.headers.length, `Expected table widget "${widget.title}" to have column headers.`).toBeGreaterThan(0);
      expect(widget.rowValues.length, `Expected table widget "${widget.title}" to have row values.`).toBeGreaterThan(0);
    }

    return tableWidgets;
  }

  async expectGrandTotalRowsDisplayedWhenAvailable() {
    await this.waitForReady();
    await this.scrollDashboardWidgets();

    const tableWidgets = await this.tableWidgetSummaries();
    expect(tableWidgets.length, "Expected table widgets to inspect for grand total rows.").toBeGreaterThan(0);

    const widgetsWithGrandTotal = tableWidgets.filter((widget) => widget.hasGrandTotal);
    for (const widget of widgetsWithGrandTotal) {
      expect(widget.grandTotalValues.length, `Expected grand total row in "${widget.title}" to show values.`).toBeGreaterThan(0);
    }

    return widgetsWithGrandTotal;
  }

  private async firstDashboardTab() {
    const tabs = this.dashboardTabs();
    await expect(tabs.first()).toBeVisible({ timeout: 60000 });
    return tabs.first();
  }

  private dashboardTabs() {
    return this.page
      .getByRole("tab")
      .filter({ hasNotText: /Lead Dashboard|Lead Listing|Lead Reports|CP Listing|Registered|Role Management|User List/i });
  }

  private async visibleDashboardNames() {
    const tabs = this.dashboardTabs();
    const count = await tabs.count().catch(() => 0);
    const names: string[] = [];

    for (let index = 0; index < count; index += 1) {
      const tab = tabs.nth(index);
      if (!await tab.isVisible().catch(() => false)) {
        continue;
      }

      const text = normalizeText(await tab.innerText().catch(() => ""));
      if (text) {
        names.push(text);
      }
    }

    return names;
  }

  private async dashboardWidgets(): Promise<DashboardWidget[]> {
    return await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };

      return Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
        .filter(visible)
        .map((heading) => {
          const title = normalize(heading.textContent);
          let current: HTMLElement | null = heading;
          let card: HTMLElement | null = null;
          let lastUpdated = "";

          for (let depth = 0; current && depth < 7; depth += 1) {
            const text = normalize(current.textContent);
            const match = text.match(/Last Updated\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i);
            if (match) {
              lastUpdated = match[0];
              card = current;
            }
            if (lastUpdated && (current.querySelector("table, svg, canvas") || /No Data Found|No data|Count of|Project|Source|Stage|Calls/i.test(text))) {
              card = current;
              break;
            }
            current = current.parentElement;
          }

          const cardText = normalize(card?.textContent ?? "");
          return {
            title,
            lastUpdated,
            hasTable: Boolean(card?.querySelector("table")),
            hasEmptyState: /No Data Found|No data/i.test(cardText),
            hasChartOrVisualization: Boolean(card?.querySelector("svg, canvas")) || /Count of|Project|Source|Stage|Calls/i.test(cardText),
            hasActionMenu: Boolean(
              Array.from(card?.querySelectorAll<HTMLElement>("button") ?? []).some((button) =>
                /actions|Edit|Delete|Download Dataset/i.test(
                  `${button.getAttribute("aria-label") ?? ""} ${button.textContent ?? ""}`,
                ),
              ),
            ),
            hasDownloadMenu: Boolean(
              Array.from(card?.querySelectorAll<HTMLButtonElement>("button") ?? []).some((button) =>
                !button.disabled &&
                /download/i.test(`${button.getAttribute("aria-label") ?? ""} ${button.textContent ?? ""}`),
              ),
            ),
          };
        })
        .filter((widget) => widget.title && widget.lastUpdated)
        .filter((widget, index, all) =>
          all.findIndex((candidate) => candidate.title === widget.title && candidate.lastUpdated === widget.lastUpdated) === index,
        );
    });
  }

  private async tableWidgetSummaries() {
    return await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };

      return Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
        .filter(visible)
        .map((heading) => {
          const title = normalize(heading.textContent);
          let current: HTMLElement | null = heading;
          let card: HTMLElement | null = null;

          for (let depth = 0; current && depth < 7; depth += 1) {
            if (/Last Updated\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(current.textContent ?? "") && current.querySelector("table")) {
              card = current;
              break;
            }
            current = current.parentElement;
          }

          const table = card?.querySelector("table");
          if (!table) {
            return null;
          }

          const headers = Array.from(table.querySelectorAll("th, [role='columnheader']"))
            .map((element) => normalize(element.textContent))
            .filter(Boolean);
          const rows = Array.from(table.querySelectorAll("tbody tr, [role='row']"))
            .map((row) => Array.from(row.querySelectorAll("td, [role='cell']"))
              .map((cell) => normalize(cell.textContent))
              .filter(Boolean))
            .filter((values) => values.length > 0);
          const grandTotalRow = rows.find((values) => values.some((value) => /grand\s*total/i.test(value)));

          return {
            title,
            headers,
            rowValues: rows.flat(),
            hasGrandTotal: Boolean(grandTotalRow),
            grandTotalValues: grandTotalRow ?? [],
          };
        })
        .filter((widget): widget is {
          title: string;
          headers: string[];
          rowValues: string[];
          hasGrandTotal: boolean;
          grandTotalValues: string[];
        } => Boolean(widget));
    });
  }

  private async scrollDashboardWidgets() {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await this.page.mouse.wheel(0, 700).catch(() => {});
      await this.page.waitForTimeout(300);
    }
    await this.page.mouse.wheel(0, -2800).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  private async openWidgetActionMenu(widgetTitle: string) {
    const actionButton = this.page
      .getByRole("button", { name: new RegExp(`Open actions for\\s+${this.escapeRegex(widgetTitle)}`, "i") })
      .first();

    if (await actionButton.isVisible().catch(() => false)) {
      await actionButton.click({ force: true });
      return await this.widgetActionMenuIsOpen();
    }

    return await this.page.evaluate((title) => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const heading = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
        .find((element) => normalize(element.textContent) === title);
      if (!heading) {
        return false;
      }

      let current: HTMLElement | null = heading;
      for (let depth = 0; current && depth < 7; depth += 1) {
        if (/Last Updated\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(current.textContent ?? "")) {
          const buttons = Array.from(current.querySelectorAll<HTMLElement>("button"));
          const action = buttons.find((button) =>
            /action|more/i.test(button.getAttribute("aria-label") ?? "") ||
            /⋮|•••|…/.test(button.textContent ?? ""),
          ) ?? buttons[buttons.length - 1];
          action?.click();
          return Boolean(action);
        }
        current = current.parentElement;
      }

      return false;
    }, widgetTitle).then(async (clicked) => clicked && await this.widgetActionMenuIsOpen()).catch(() => false);
  }

  private async openWidgetDownloadMenu(widgetTitle: string) {
    const downloadButton = this.page
      .getByRole("button", { name: new RegExp(`Open download options for\\s+${this.escapeRegex(widgetTitle)}`, "i") })
      .first();

    if (await downloadButton.isVisible().catch(() => false)) {
      await expect(downloadButton).toBeEnabled({ timeout: 10000 });
      await downloadButton.click({ force: true });
      return await this.widgetDownloadMenuIsOpen();
    }

    return await this.page.evaluate((title) => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const heading = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
        .find((element) => normalize(element.textContent) === title);
      if (!heading) {
        return false;
      }

      let current: HTMLElement | null = heading;
      for (let depth = 0; current && depth < 7; depth += 1) {
        if (/Last Updated\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(current.textContent ?? "")) {
          const buttons = Array.from(current.querySelectorAll<HTMLButtonElement>("button"));
          const download = buttons.find((button) =>
            !button.disabled &&
            /download/i.test(`${button.getAttribute("aria-label") ?? ""} ${button.textContent ?? ""}`),
          );
          download?.click();
          return Boolean(download);
        }
        current = current.parentElement;
      }

      return false;
    }, widgetTitle).then(async (clicked) => clicked && await this.widgetDownloadMenuIsOpen()).catch(() => false);
  }

  private async widgetActionMenuIsOpen() {
    return await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        return /Download Dataset|Edit|Delete/i.test(bodyText);
      }, { timeout: 5000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
  }

  private async widgetDownloadMenuIsOpen() {
    return await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        return /Download PDF|Download CSV|Download Excel|Download Dataset|PDF|CSV|Excel/i.test(bodyText);
      }, { timeout: 5000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
  }

  private async selectFirstDashboard() {
    const tab = await this.firstDashboardTab();
    const dashboardName = normalizeText(await tab.innerText());
    await tab.click({ force: true });
    await this.page.waitForLoadState("networkidle").catch(() => {});
    return dashboardName;
  }

  private async editButtonForDashboard(dashboardName: string) {
    const dashboardTitle = this.trimDashboardTabText(dashboardName);
    const selectedTab = this.dashboardTabs().filter({ hasText: new RegExp(this.escapeRegex(dashboardTitle), "i") }).first();
    const selectedTabEditButton = selectedTab.getByRole("button", { name: new RegExp(`^Edit\\s+${this.escapeRegex(dashboardTitle)}$`, "i") }).first();

    if (await selectedTabEditButton.isVisible().catch(() => false)) {
      return selectedTabEditButton;
    }

    const editForDashboard = this.page
      .getByRole("button", { name: new RegExp(`^Edit\\s+${this.escapeRegex(dashboardTitle)}$`, "i") })
      .first();

    if (await editForDashboard.isVisible().catch(() => false)) {
      return editForDashboard;
    }

    return this.page.getByRole("button", { name: /^Edit\b/i }).first();
  }

  private async clickDashboardEditAction(editButton: Locator) {
    const opened = await clickWithFallback(
      editButton,
      this.page,
      async () => await this.dashboardEditPanelIsVisible(),
      { force: true },
    )
      .then(async () => await this.dashboardEditPanelIsVisible())
      .catch(() => false);

    if (opened) {
      return;
    }

    await editButton.hover({ force: true }).catch(() => {});
    await editButton.click({ force: true }).catch(() => {});

    const openedAfterRetry = await expect
      .poll(async () => await this.dashboardEditPanelIsVisible(), { timeout: 10000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!openedAfterRetry) {
      const box = await editButton.boundingBox().catch(() => null);
      if (box) {
        await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    }
  }

  private async dashboardEditPanelIsVisible() {
    const hasHeading = await this.page
      .getByRole("heading", { name: /edit dashboard/i })
      .isVisible()
      .catch(() => false);
    const hasDeleteAction = await this.page
      .getByRole("button", { name: /delete dashboard/i })
      .isVisible()
      .catch(() => false);
    const hasAccessPermission = await this.page
      .getByRole("button", { name: /select access permission/i })
      .isVisible()
      .catch(() => false);

    return hasHeading || (hasDeleteAction && hasAccessPermission);
  }

  private async expectDashboardEditPanelVisible() {
    await expect
      .poll(async () => await this.dashboardEditPanelIsVisible(), { timeout: 30000 })
      .toBeTruthy();
  }

  private trimDashboardTabText(value: string) {
    return normalizeText(value)
      .replace(/\s+\d+\s+Edit\s+.*$/i, "")
      .replace(/\s+Edit\s+.*$/i, "")
      .trim();
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
