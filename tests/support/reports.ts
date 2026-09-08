import type { Page, Locator } from "@playwright/test";
import { expect, test as base } from "@playwright/test";
import { ReportsPage } from "../pages";
import {
  clickWithFallback,
  escapeRegex,
  hasVisibleHeading,
  hasVisibleText,
  normalizeText,
  tryClickFirstVisible,
} from "./ui-actions";

type AppConfig = {
  activeProjectName: string;
};

type CreatedReportAssets = {
  dashboardName: string;
  chartName: string;
  dashboardDeleted: boolean;
};

type ReportChartConfig = {
  module: string;
  subModule: string;
  dashboard: string;
  dateType: string;
  dateRange: string;
  chartType: string;
  measure: string;
  dimension: string;
};

const LEAD_REPORT_CHART_CONFIG: Omit<ReportChartConfig, "dashboard"> = {
  module: "Lead Management",
  subModule: "Leads",
  dateType: "Created At",
  dateRange: "Last 30 Days",
  chartType: "Line",
  measure: "Count of Leads",
  dimension: "Source"
};

function randomDigits(length: number) {
  const min = 10 ** (length - 1);
  const max = (10 ** length) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

function buildOverlayRoot(page: Page) {
  return page.locator(
    "[role='dialog'], [data-radix-popper-content-wrapper], [class*='popover'], [class*='menu'], #root-modal, .fixed.z-\\[2000\\]"
  );
}

async function waitForReportsDashboard(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});

  await expect
    .poll(async () => {
      const bodyText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      const hasDashboardHeading = await hasVisibleHeading(page, /Reports Dashboard/i);
      const hasDashboardControls = await hasVisibleText(page, /Create Dashboard|Create Chart|Create New/i);

      return (
        hasDashboardHeading ||
        hasDashboardControls ||
        /Reports Dashboard|Create Dashboard|Create Chart|Create New/i.test(bodyText)
      );
    }, { timeout: 60000 })
    .toBeTruthy();
}

async function reportsDashboardIsReady(page: Page) {
  const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
  const hasDashboardHeading = await hasVisibleHeading(page, /Reports Dashboard/i);
  const hasDashboardControls = await hasVisibleText(page, /Create Dashboard|Create Chart|Create New/i);

  return (
    hasDashboardHeading ||
    hasDashboardControls ||
    /Reports Dashboard|Create Dashboard|Create Chart|Create New/i.test(bodyText)
  );
}

async function openReportsDashboardFromCurrentPage(page: Page) {
  if (await reportsDashboardIsReady(page)) {
    return;
  }

  const reportsDashboardCandidates = [
    page.getByRole("button", { name: /reports dashboard/i }).first(),
    page.getByRole("link", { name: /reports dashboard/i }).first(),
    page
      .locator("button,a")
      .filter({ has: page.locator('img[alt*="reports dashboard" i]') })
      .first(),
    page.getByText(/^Reports Dashboard$/i).first(),
    page.getByText(/Reports Dashboard/i).first(),
  ];

  if (await tryClickFirstVisible(reportsDashboardCandidates, { force: true })) {
    await waitForReportsDashboard(page);
    return;
  }

  throw new Error('The "Reports Dashboard" entry point was not visible after creating the dashboard.');
}

async function waitForDashboardAvailable(page: Page, dashboardName: string, timeout = 60000) {
  return await expect
    .poll(async () => {
      const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
      return bodyText.includes(dashboardName);
    }, { timeout })
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
}

async function waitForLoadingToFinish(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect
    .poll(async () => {
      const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
      return !/\bloading\b|fetching|please wait/i.test(bodyText);
    }, { timeout: 15000 })
    .toBeTruthy()
    .catch(() => {});
}

export async function goToLeadReports(page: Page, app: AppConfig) {
  await new ReportsPage(page).open(app);
}

async function openCreateNewMenu(page: Page) {
  const createNewLabel = page.getByText(/^Create New$/i).first();
  const createNewCandidates = [
    page.getByRole("button", { name: /^create new$/i }),
    createNewLabel.locator("xpath=ancestor::button[1]").first(),
    createNewLabel.locator("xpath=ancestor::div[1]").first(),
    page.locator("div").filter({ hasText: /^Create New$/i }).first(),
    createNewLabel
  ];

  for (const candidate of createNewCandidates) {
    const target = candidate.first();
    if (!await target.isVisible().catch(() => false)) {
      continue;
    }

    await clickWithFallback(
      target,
      page,
      async () => {
        const createDashboardVisible = await page.getByRole("button", { name: /create dashboard/i }).isVisible().catch(() => false);
        const createChartVisible = await page.getByRole("button", { name: /create chart/i }).isVisible().catch(() => false);
        return createDashboardVisible || createChartVisible;
      },
      { force: true }
    ).catch(() => {});

    const createDashboardVisible = await page.getByRole("button", { name: /create dashboard/i }).isVisible().catch(() => false);
    const createChartVisible = await page.getByRole("button", { name: /create chart/i }).isVisible().catch(() => false);
    if (createDashboardVisible || createChartVisible) {
      return;
    }
  }

  throw new Error('The "Create New" action did not open the report creation menu.');
}

async function findDropdownSearchInput(page: Page) {
  const candidates = [
    buildOverlayRoot(page).getByRole("textbox", { name: /search/i }).last(),
    buildOverlayRoot(page).locator('input[placeholder*="search" i]').last(),
    page.getByRole("textbox", { name: /search/i }).last(),
    page.locator('input[placeholder*="search" i]').last()
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }

  return null;
}

async function getDropdownOptionButtons(page: Page, dropdown?: Locator) {
  const optionGroups = [
    dropdown?.locator("xpath=ancestor::div[1]//button").filter({ hasText: /\S/ }),
    dropdown?.locator("xpath=ancestor::div[2]//button").filter({ hasText: /\S/ }),
    buildOverlayRoot(page).getByRole("button").filter({ hasText: /\S/ }),
    buildOverlayRoot(page).locator("button").filter({ hasText: /\S/ }),
    buildOverlayRoot(page).locator("[role='option'], [role='menuitem']").filter({ hasText: /\S/ })
  ].filter((group): group is Locator => Boolean(group));

  for (const group of optionGroups) {
    const count = await group.count().catch(() => 0);
    if (count > 0) {
      return group;
    }
  }

  return optionGroups[0];
}

async function waitForDropdownPanel(page: Page, dropdown: Locator) {
  const opened = await expect
    .poll(async () => {
      const expanded = await dropdown.getAttribute("aria-expanded").catch(() => null);
      const searchInputVisible = await findDropdownSearchInput(page).then((input) => Boolean(input));
      const optionButtons = await getDropdownOptionButtons(page, dropdown);
      const optionCount = await optionButtons.count().catch(() => 0);

      return expanded === "true" || searchInputVisible || optionCount > 1;
    }, { timeout: 8000 })
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);

  if (!opened) {
    throw new Error("Dropdown panel did not open after clicking the trigger.");
  }
}

async function resolveDropdownTrigger(page: Page, label: RegExp) {
  const candidates = [
    page.getByRole("button", { name: label }).last(),
    page.getByRole("button", { name: label }).first(),
    page.locator("button").filter({ hasText: label }).last(),
    page.locator("button").filter({ hasText: label }).first()
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }

  return candidates[0];
}

async function resolveFieldDropdownTrigger(page: Page, fieldLabel: string) {
  const fieldPattern = new RegExp(`^${escapeRegex(fieldLabel)}\\s*\\*?$`, "i");
  const fieldLabels = [
    page.getByRole("heading", { name: fieldPattern }).last(),
    page.getByText(fieldPattern).last()
  ];

  for (const field of fieldLabels) {
    if (!await field.isVisible().catch(() => false)) {
      continue;
    }

    const dropdown = field.locator("xpath=following::button[1]").first();
    if (await dropdown.isVisible().catch(() => false)) {
      return dropdown;
    }
  }

  throw new Error(`Dropdown field "${fieldLabel}" was not visible.`);
}

async function openDropdownLocator(page: Page, dropdown: Locator) {
  await expect(dropdown).toBeVisible({ timeout: 30000 });
  await dropdown.scrollIntoViewIfNeeded().catch(() => {});

  const fieldWrapperCandidates = [
    dropdown,
    dropdown.locator("xpath=ancestor::div[1]").first(),
    dropdown.locator("xpath=ancestor::div[2]").first(),
    dropdown.locator("xpath=preceding-sibling::*[1]").first(),
    dropdown.locator("xpath=following-sibling::*[1]").first()
  ];

  for (const candidate of fieldWrapperCandidates) {
    if (!await candidate.isVisible().catch(() => false)) {
      continue;
    }

    await candidate.click({ force: true }).catch(() => {});
    const openedByClick = await expect
      .poll(async () => {
        const expanded = await dropdown.getAttribute("aria-expanded").catch(() => null);
        const searchInputVisible = await findDropdownSearchInput(page).then((input) => Boolean(input));
        const optionButtons = await getDropdownOptionButtons(page, dropdown);
        const optionCount = await optionButtons.count().catch(() => 0);
        return expanded === "true" || searchInputVisible || optionCount > 1;
      }, { timeout: 1200 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (openedByClick) {
      return dropdown;
    }
  }

  const clickPositions: Array<{ x: number; y: number }> = [
    { x: 0.88, y: 0.5 },
    { x: 0.94, y: 0.5 },
    { x: 0.75, y: 0.5 },
    { x: 0.5, y: 0.5 }
  ];

  const box = await dropdown.boundingBox().catch(() => null);
  if (box) {
    for (const position of clickPositions) {
      await dropdown.click({
        force: true,
        position: {
          x: Math.max(4, Math.min(box.width - 4, Math.floor(box.width * position.x))),
          y: Math.max(4, Math.min(box.height - 4, Math.floor(box.height * position.y)))
        }
      }).catch(() => {});

      const openedByPosition = await expect
        .poll(async () => {
          const expanded = await dropdown.getAttribute("aria-expanded").catch(() => null);
          const searchInputVisible = await findDropdownSearchInput(page).then((input) => Boolean(input));
          const optionButtons = await getDropdownOptionButtons(page, dropdown);
          const optionCount = await optionButtons.count().catch(() => 0);
          return expanded === "true" || searchInputVisible || optionCount > 1;
        }, { timeout: 1200 })
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);

      if (openedByPosition) {
        return dropdown;
      }
    }
  }

  await waitForDropdownPanel(page, dropdown).catch(async () => {
    await dropdown.press("Enter").catch(() => {});
    const openedByEnter = await expect
      .poll(async () => {
        const expanded = await dropdown.getAttribute("aria-expanded").catch(() => null);
        const searchInputVisible = await findDropdownSearchInput(page).then((input) => Boolean(input));
        const optionButtons = await getDropdownOptionButtons(page, dropdown);
        const optionCount = await optionButtons.count().catch(() => 0);
        return expanded === "true" || searchInputVisible || optionCount > 1;
      }, { timeout: 1200 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (openedByEnter) {
      return;
    }

    await dropdown.press("ArrowDown").catch(() => {});
    await waitForDropdownPanel(page, dropdown);
  });
  return dropdown;
}

async function openDropdown(page: Page, label: RegExp) {
  return await openDropdownLocator(page, await resolveDropdownTrigger(page, label));
}

async function scrollDropdownList(page: Page, dropdown: Locator) {
  return await dropdown.evaluate((trigger) => {
    const scrollables = Array.from(document.querySelectorAll("div")).filter((element) => {
      const html = element as HTMLDivElement;
      const style = window.getComputedStyle(html);
      const rect = html.getBoundingClientRect();

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        html.scrollHeight > html.clientHeight &&
        (style.overflowY === "auto" || style.overflowY === "scroll")
      );
    });

    const triggerRect = (trigger as HTMLElement).getBoundingClientRect();
    const ranked = scrollables
      .map((element) => {
        const html = element as HTMLDivElement;
        const rect = html.getBoundingClientRect();
        const overlapX = rect.left <= triggerRect.right + 40 && rect.right >= triggerRect.left - 40;
        const nearTrigger = rect.top <= triggerRect.bottom + 220 && rect.bottom >= triggerRect.top - 40;
        const optionCount = html.querySelectorAll("button, [role='button'], [role='option'], [role='menuitem']").length;
        const distance = Math.abs(rect.top - triggerRect.bottom);
        return { html, overlapX, nearTrigger, optionCount, distance };
      })
      .filter((item) => item.optionCount > 0)
      .sort((a, b) => {
        if (a.overlapX !== b.overlapX) {
          return a.overlapX ? -1 : 1;
        }
        if (a.nearTrigger !== b.nearTrigger) {
          return a.nearTrigger ? -1 : 1;
        }
        if (a.optionCount !== b.optionCount) {
          return b.optionCount - a.optionCount;
        }
        return a.distance - b.distance;
      });

    for (const { html } of ranked) {
      const previousTop = html.scrollTop;
      html.scrollTop = Math.min(
        html.scrollTop + Math.max(Math.floor(html.clientHeight * 0.7), 180),
        html.scrollHeight
      );
      if (html.scrollTop !== previousTop) {
        return true;
      }
    }

    return false;
  });
}

async function fillDropdownSearch(page: Page, value: string) {
  const searchInput = await findDropdownSearchInput(page);
  if (!searchInput) {
    return false;
  }

  await searchInput.fill("");
  await searchInput.fill(value);
  await waitForLoadingToFinish(page);
  return true;
}

async function clickDropdownOption(page: Page, dropdown: Locator, optionName: string, searchText?: string) {
  const optionPattern = new RegExp(`^${escapeRegex(optionName)}$`, "i");

  if (searchText) {
    await fillDropdownSearch(page, searchText);
  }

  const optionText = buildOverlayRoot(page).getByText(optionPattern).last();
  const optionLocators = [
    dropdown.locator("xpath=ancestor::div[1]//button").filter({ hasText: optionPattern }).last(),
    dropdown.locator("xpath=ancestor::div[2]//button").filter({ hasText: optionPattern }).last(),
    optionText.locator("xpath=ancestor::button[1]").last(),
    buildOverlayRoot(page).getByRole("button", { name: optionPattern }).last(),
    buildOverlayRoot(page).getByRole("option", { name: optionPattern }).last(),
    buildOverlayRoot(page).getByRole("button").filter({ has: optionText }).last(),
    buildOverlayRoot(page).locator("button").filter({ hasText: optionPattern }).last(),
    optionText
  ];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    for (const locator of optionLocators) {
      if (await locator.isVisible().catch(() => false)) {
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.click({ force: true });
        return true;
      }
    }

    await page.waitForTimeout(500);
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (const locator of optionLocators) {
      if (await locator.isVisible().catch(() => false)) {
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.click({ force: true });
        return true;
      }
    }

    const scrolled = await scrollDropdownList(page, dropdown);
    if (!scrolled) {
      break;
    }

    await page.waitForTimeout(400);
  }

  return false;
}

async function confirmPopupSelection(page: Page) {
  const overlay = buildOverlayRoot(page);
  const confirmationCandidates = [
    overlay.getByRole("button", { name: /\bselected\b/i }).last(),
    overlay.getByRole("button", { name: /\d+\s+selected/i }).last(),
    overlay.getByRole("button", { name: /^done$/i }).last(),
    overlay.getByRole("button", { name: /^apply$/i }).last(),
    page.getByRole("button", { name: /\d+\s+selected/i }).last(),
    page.getByRole("button", { name: /\bselected\b/i }).last()
  ];

  const clicked = await tryClickFirstVisible(confirmationCandidates, { force: true });
  if (!clicked) {
    await page.keyboard.press("Escape").catch(() => {});
  }
}

async function selectDashboardDropdownValue(
  page: Page,
  dropdownLabel: RegExp,
  preferredOptions: string[],
  expectedValuePattern?: RegExp,
  searchText?: string
) {
  const dropdown = await openDropdown(page, dropdownLabel);

  let selectedText: string | null = null;
  for (const optionName of preferredOptions) {
    const selected = await clickDropdownOption(page, dropdown, optionName, searchText ?? optionName);
    if (selected) {
      selectedText = optionName;
      break;
    }
  }

  if (!selectedText) {
    throw new Error(`No selectable option was visible for ${dropdownLabel.toString()}.`);
  }

  await confirmPopupSelection(page);

  if (expectedValuePattern) {
    await expect(page.locator("body")).toContainText(expectedValuePattern, { timeout: 15000 });
  }

  return selectedText;
}

async function selectSingleDropdownOption(page: Page, dropdownLabel: RegExp, optionName: string, searchText?: string) {
  const dropdown = await openDropdown(page, dropdownLabel);
  const selected = await clickDropdownOption(page, dropdown, optionName, searchText ?? optionName);
  if (!selected) {
    throw new Error(`Dropdown option "${optionName}" was not visible for ${dropdownLabel.toString()}.`);
  }

  await waitForLoadingToFinish(page);
  await expectSelectedDropdownValue(dropdown, optionName);
}

async function selectReportFieldDropdownOption(
  page: Page,
  fieldLabel: string,
  optionName: string,
  searchText?: string,
  closeAfterSelection = false
) {
  const dropdown = await openDropdownLocator(page, await resolveFieldDropdownTrigger(page, fieldLabel));
  const selected = await clickDropdownOption(page, dropdown, optionName, searchText ?? optionName);
  if (!selected) {
    throw new Error(`Dropdown option "${optionName}" was not visible for "${fieldLabel}".`);
  }

  await waitForLoadingToFinish(page);
  await expectSelectedDropdownValue(dropdown, optionName);

  if (closeAfterSelection) {
    await page.keyboard.press("Escape").catch(() => {});
    await waitForLoadingToFinish(page);
  }
}

async function expectSelectedDropdownValue(dropdown: Locator, optionName: string) {
  const optionPattern = new RegExp(escapeRegex(optionName), "i");
  await expect
    .poll(async () => {
      const text = normalizeText(await dropdown.innerText().catch(() => ""));
      const title = normalizeText(await dropdown.getAttribute("title").catch(() => ""));
      return optionPattern.test(`${text} ${title}`);
    }, { timeout: 15000 })
    .toBeTruthy();
}

async function selectMultiDropdownOptions(
  page: Page,
  dropdownLabel: RegExp,
  optionNames: string[],
  confirmSelection = true
) {
  const dropdown = await openDropdown(page, dropdownLabel);

  for (const optionName of optionNames) {
    const selected = await clickDropdownOption(page, dropdown, optionName, optionName);
    if (!selected) {
      throw new Error(`Dropdown option "${optionName}" was not visible for ${dropdownLabel.toString()}.`);
    }
  }

  if (confirmSelection) {
    await confirmPopupSelection(page);
  }
}

async function createDashboard(page: Page, dashboardName: string) {
  await openCreateNewMenu(page);

  const createDashboardButton = page.getByRole("button", { name: /create dashboard/i }).first();
  await expect(createDashboardButton).toBeVisible({ timeout: 30000 });
  await createDashboardButton.click({ force: true });

  const dashboardNameInput = page.getByRole("textbox", { name: /enter dashboard name/i }).first();
  await expect(dashboardNameInput).toBeVisible({ timeout: 30000 });
  await dashboardNameInput.fill(dashboardName);

  await selectDashboardDropdownValue(
    page,
    /select the charts/i,
    ["Lead Stages", "CP", "CP Leads"],
    /selected/i
  );
  await selectDashboardDropdownValue(
    page,
    /select access permission/i,
    ["Select All"],
    /selected/i
  );

  const saveButton = page.getByRole("button", { name: /^save$/i }).last();
  await expect(saveButton).toBeVisible({ timeout: 30000 });
  await saveButton.click({ force: true });

  const createdOnCurrentScreen = await waitForDashboardAvailable(page, dashboardName, 30000);
  if (!createdOnCurrentScreen) {
    await openReportsDashboardFromCurrentPage(page);
    await expect
      .poll(async () => {
        const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
        return bodyText.includes(dashboardName);
      }, { timeout: 60000 })
      .toBeTruthy();
  }
}

async function createChart(page: Page, dashboardName: string, chartName: string) {
  const chartConfig: ReportChartConfig = {
    ...LEAD_REPORT_CHART_CONFIG,
    dashboard: dashboardName
  };

  await openCreateNewMenu(page);

  const createChartButton = page.getByRole("button", { name: /create chart/i }).first();
  await expect(createChartButton).toBeVisible({ timeout: 30000 });
  await createChartButton.click({ force: true });

  const chartNameInput = page.getByRole("textbox", { name: /enter chart name/i }).first();
  await expect(chartNameInput).toBeVisible({ timeout: 30000 });
  await chartNameInput.fill(chartName);

  await selectReportFieldDropdownOption(page, "Module", chartConfig.module);
  await selectReportFieldDropdownOption(page, "Sub Module", chartConfig.subModule);
  await selectReportFieldDropdownOption(page, "Dashboard", chartConfig.dashboard, chartConfig.dashboard, true);
  await selectReportFieldDropdownOption(page, "Date Type", chartConfig.dateType);
  await selectReportFieldDropdownOption(page, "Date Range", chartConfig.dateRange);
  await selectReportFieldDropdownOption(page, "Select a Chart Type", chartConfig.chartType);
  await selectReportFieldDropdownOption(page, "Measure", chartConfig.measure);
  await selectReportFieldDropdownOption(page, "Dimension 1", chartConfig.dimension);

  const previewButton = page.getByRole("button", { name: /generate preview/i }).first();
  await expect(previewButton).toBeVisible({ timeout: 30000 });
  await previewButton.click({ force: true });

  await expect
    .poll(async () => {
      const bodyText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      return /preview|last updated|source|count of leads/i.test(bodyText);
    }, { timeout: 60000 })
    .toBeTruthy();

  const saveButton = page.getByRole("button", { name: /^save$/i }).last();
  await expect(saveButton).toBeVisible({ timeout: 30000 });
  await expect(saveButton).toBeEnabled({ timeout: 30000 });
  await saveButton.scrollIntoViewIfNeeded().catch(() => {});
  await saveButton.click();

  const saved = await expect
    .poll(async () => {
      const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
      return (
        /chart saved successfully|saved successfully|last updated/i.test(bodyText) &&
        bodyText.includes(chartName)
      );
    }, { timeout: 60000 })
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);

  if (!saved) {
    await saveButton.click({ force: true }).catch(() => {});
    await expect
      .poll(async () => {
        const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
        return (
          /chart saved successfully|saved successfully|last updated/i.test(bodyText) &&
          bodyText.includes(chartName)
        );
      }, { timeout: 60000 })
      .toBeTruthy();
  }
}

async function deleteDashboard(page: Page, dashboardName: string) {
  await page.getByRole("button", { name: /reports dashboard/i }).click({ force: true }).catch(async () => {
    await page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "networkidle" });
  });
  await waitForReportsDashboard(page);

  const dashboardNamePattern = new RegExp(escapeRegex(dashboardName), "i");
  const dashboardTab = page.getByRole("tab", { name: dashboardNamePattern }).first();
  if (await dashboardTab.isVisible().catch(() => false)) {
    await dashboardTab.scrollIntoViewIfNeeded().catch(() => {});
    await dashboardTab.click({ force: true });
  }

  const editButton = page.getByRole("button", { name: new RegExp(`^Edit ${escapeRegex(dashboardName)}$`, "i") }).first();
  await expect(editButton).toBeVisible({ timeout: 60000 });
  await editButton.scrollIntoViewIfNeeded().catch(() => {});
  await editButton.click({ force: true });

  const deleteDashboardButton = page.getByRole("button", { name: /^delete dashboard$/i }).first();
  await expect(deleteDashboardButton).toBeVisible({ timeout: 30000 });
  await deleteDashboardButton.click({ force: true });

  const confirmDeleteButton = page.getByRole("button", { name: /^delete$/i }).last();
  await expect(confirmDeleteButton).toBeVisible({ timeout: 30000 });
  await confirmDeleteButton.click({ force: true });

  await expect
    .poll(async () => {
      const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
      return /dashboard deleted|deleted successfully|successfully deleted/i.test(bodyText);
    }, { timeout: 60000 })
    .toBeTruthy();

  await expect(editButton).toBeHidden({ timeout: 60000 });
  await expect(page.getByRole("tab", { name: dashboardNamePattern })).toHaveCount(0, { timeout: 60000 });
}

export async function createLeadReportDashboardAndChart(page: Page, app: AppConfig): Promise<CreatedReportAssets> {
  const dashboardName = `Automation Dashboard ${randomDigits(4)}`;
  const chartName = `Automation Report ${randomDigits(4)}`;

  await base.step("Open lead reports page", async () => {
    await goToLeadReports(page, app);
  });
  await base.step("Create report dashboard", async () => {
    await createDashboard(page, dashboardName);
  });
  await base.step("Create source chart", async () => {
    await createChart(page, dashboardName, chartName);
  });
  await base.step("Delete automation dashboard", async () => {
    await deleteDashboard(page, dashboardName);
  });

  return { dashboardName, chartName, dashboardDeleted: true };
}
