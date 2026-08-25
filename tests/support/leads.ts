import type { Page } from "@playwright/test";
import { expect, type Locator } from "@playwright/test";
import leadFlowConfig from "../data/lead-flow.json";
import { ensureActiveProject } from "./auth";

type AppConfig = {
  envName: string;
  baseUrl: string;
  activeProjectName: string;
};

type LeadSeed = {
  projectName: string;
  fullName: string;
  whatsappNumber: string;
  sourceCategory: string;
  companyName: string;
  preferredLocation: string;
  otherPreferences: string;
};

type EditedLead = {
  previousName: string;
  updatedName: string;
  updatedEmail: string;
};

type StageTransition = {
  stage: string;
  remark: string;
};

function randomDigits(length: number) {
  const min = 10 ** (length - 1);
  const max = (10 ** length) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

export function buildLeadSeed(envName: string): LeadSeed {
  const envSeed = leadFlowConfig[envName as keyof typeof leadFlowConfig];
  const suffix = randomDigits(4);

  return {
    projectName: envSeed.projectName,
    fullName: `${envSeed.fullNamePrefix} ${suffix}`,
    whatsappNumber: `9${randomDigits(9)}`,
    sourceCategory: envSeed.sourceCategory,
    companyName: envSeed.companyName,
    preferredLocation: envSeed.preferredLocation,
    otherPreferences: envSeed.otherPreferences
  };
}

export async function goToManageLeads(page: Page, app: AppConfig) {
  await page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "networkidle" });
  await ensureActiveProject(page, app.activeProjectName);
  await waitForManageConstructionContent(page);
  await expect(page.locator("button").nth(2)).toBeVisible({ timeout: 60000 });
  await page.locator("button").nth(2).click();
  await expect(page.getByText("Engagement Intelligence", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /manage leads/i }).click();
  await page.waitForURL(/engagement-intelligence\/manage-leads/, { timeout: 60000 });
  await waitForListingReady(page);
}

function dropdownFor(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator("xpath=following::button[1]");
}

async function waitForDropdownOptions(page: Page) {
  const optionLocator = page.locator('#root-modal button[class*="text-left"], #root-modal button[class*="hover:text-gray-300"]');
  await expect(optionLocator.first()).toBeVisible({ timeout: 15000 });

  await expect
    .poll(async () => {
      const optionTexts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("#root-modal button"))
          .filter((button) => button.className.includes("text-left") || button.className.includes("hover:text-gray-300"))
          .map((button) => button.textContent?.trim())
          .filter((text): text is string => Boolean(text) && text.toLowerCase() !== "clear");
      });

      return optionTexts.length;
    }, { timeout: 15000 })
    .toBeGreaterThan(0);
}

async function chooseFirstOption(page: Page, preferredOptions: string[] = []) {
  const optionLocator = page.locator('#root-modal button[class*="text-left"], #root-modal button[class*="hover:text-gray-300"]');
  await waitForDropdownOptions(page);

  const optionTexts = await page.evaluate((preferred) => {
    const buttons = Array.from(document.querySelectorAll("#root-modal button"))
      .filter((button) => button.className.includes("text-left") || button.className.includes("hover:text-gray-300"));
    const texts = buttons
      .map((button) => button.textContent?.trim())
      .filter((text): text is string => Boolean(text) && text.toLowerCase() !== "clear");

    const preferredMatch = preferred.find((option) => texts.includes(option));
    if (preferredMatch) {
      return { selected: preferredMatch, all: texts };
    }

    return { selected: texts[0] ?? null, all: texts };
  }, preferredOptions);

  if (!optionTexts.selected) {
    throw new Error(`No dropdown option found. Visible option texts: ${optionTexts.all.join(", ")}`);
  }

  await optionLocator.filter({ hasText: optionTexts.selected }).first().click({ force: true });
  await page.waitForTimeout(500);
  return optionTexts.selected;
}

async function waitForDropdownValue(page: Page, label: string, expectedValue: string) {
  await expect
    .poll(async () => {
      const text = await dropdownFor(page, label).innerText();
      return text.replace(/\s+/g, " ").trim();
    }, { timeout: 15000 })
    .toContain(expectedValue);
}

async function waitForSubSourceReady(page: Page) {
  await expect
    .poll(async () => {
      const className = await dropdownFor(page, "Sub Source *").getAttribute("class");
      return className || "";
    }, { timeout: 15000 })
    .not.toContain("cursor-not-allowed");

  await page.waitForTimeout(2000);
}

async function waitForDependentSelection(page: Page, kind: "project" | "source" | "subSource", expectedValue: string) {
  if (kind === "project") {
    await page.waitForTimeout(2000);
    return;
  }

  if (kind === "source") {
    await waitForSubSourceReady(page);
    await page.waitForTimeout(1200);
    return;
  }

  await page.waitForTimeout(800);
}

export async function fillLeadForm(page: Page, app: AppConfig) {
  const leadSeed = buildLeadSeed(app.envName);
  leadSeed.projectName = app.activeProjectName;
  const envSeed = leadFlowConfig[app.envName as keyof typeof leadFlowConfig];
  const sourcePreferences = leadFlowConfig[app.envName as keyof typeof leadFlowConfig].fallbackSourcePreferences;
  await waitForListingReady(page);

  const addLeadButton = page.getByText("Add Lead", { exact: true });
  await addLeadButton.click();
  await expect(page.getByText("Lead Form", { exact: true })).toBeVisible({ timeout: 30000 });

  await page.locator("#fullName").fill(leadSeed.fullName);

  await dropdownFor(page, "Project Name *").click();
  const selectedProject = await chooseFirstOption(page, [app.activeProjectName, envSeed.projectName]);
  await waitForDependentSelection(page, "project", selectedProject);

  await dropdownFor(page, "Source *").click();
  const selectedSource = await chooseFirstOption(page, sourcePreferences);
  await waitForDependentSelection(page, "source", selectedSource);

  await waitForSubSourceReady(page);
  await dropdownFor(page, "Sub Source *").click();
  const selectedSubSource = await chooseFirstOption(page);
  await waitForDependentSelection(page, "subSource", selectedSubSource);

  await page.locator("#whatsAppNumber").fill(leadSeed.whatsappNumber);
  await page.locator("#sourceCategory").fill(leadSeed.sourceCategory);

  if (await page.locator("#companyName").isVisible().catch(() => false)) {
    await page.locator("#companyName").fill(leadSeed.companyName);
  }

  if (await page.locator("#preferredLocation").isVisible().catch(() => false)) {
    await page.locator("#preferredLocation").fill(leadSeed.preferredLocation);
  }

  if (await page.locator("#otherPreferences").isVisible().catch(() => false)) {
    await page.locator("#otherPreferences").fill(leadSeed.otherPreferences);
  }

  await page.locator("#root-modal").getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText("Lead Form", { exact: true })).not.toBeVisible({ timeout: 60000 });

  return leadSeed;
}

export async function assertLeadCreated(page: Page, leadName: string, projectName: string) {
  await expect(page.getByRole("button", { name: new RegExp(projectName, "i") })).toBeVisible({ timeout: 10000 }).catch(() => {});
  const searchInput = page.locator("#search");
  await searchInput.fill(leadName);
  await searchInput.press("Enter").catch(() => {});
  await page.waitForTimeout(2000);
  await expect(page.getByText(leadName, { exact: true })).toBeVisible({ timeout: 60000 });
}

export async function openLeadByName(page: Page, leadName: string) {
  const searchInput = page.locator("#search");
  await searchInput.fill(leadName);
  await searchInput.press("Enter").catch(() => {});
  await page.waitForTimeout(2500);

  const leadNameText = page.getByText(new RegExp(`^${leadName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")).first();
  await expect(leadNameText).toBeVisible({ timeout: 60000 });
  await leadNameText.click({ force: true });
  await waitForLeadProfile(page);
}

async function clickFirstVisible(page: Page, locators: Locator[]) {
  for (const locator of locators) {
    if (await locator.first().isVisible().catch(() => false)) {
      await locator.first().click();
      return true;
    }
  }

  return false;
}

async function waitForLeadListingContent(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});

  await expect
    .poll(async () => {
      const bodyText = await page.locator("body").innerText();
      return /Lead ID|No leads|Follow Up|Site Visit|Opportunity|Channel Partner|Direct Site Visit/i.test(bodyText);
    }, { timeout: 60000 })
    .toBeTruthy();
}

async function waitForManageConstructionContent(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});

  await expect
    .poll(async () => {
      const bodyText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      return /Manage Construction|Schedule Control|Site Tracker|Saved Reports/i.test(bodyText) && !/loading/i.test(bodyText);
    }, { timeout: 30000 })
    .toBeTruthy();
}

async function waitForListingReady(page: Page) {
  await waitForLeadListingContent(page);

  const addLeadButton = page.getByText("Add Lead", { exact: true });
  await expect(addLeadButton).toBeVisible({ timeout: 60000 });
  await expect(addLeadButton).toBeEnabled({ timeout: 60000 });
  await page.waitForTimeout(1500);
}

async function waitForLeadProfile(page: Page) {
  await page.waitForURL(/engagement-intelligence\/manage-leads\?id=/, { timeout: 30000 }).catch(() => {});

  await expect
    .poll(async () => {
      const bodyText = await page.locator("body").innerText();
      return /Lead ID\s*:|Edit Lead Form|Change Stage|Lead Journey|Full Name\s*:/i.test(bodyText);
    }, { timeout: 60000 })
    .toBeTruthy();

  await expect(page.locator("body")).toContainText(/Lead ID\s*:/i, { timeout: 60000 });
  await expect
    .poll(async () => {
      const hasLeadNameSection = await page.getByText(/Full Name\s*:/i).first().isVisible().catch(() => false);
      const hasEditLead = await page.getByText(/Edit Lead Form/i).first().isVisible().catch(() => false);
      const hasChangeStage = await page.getByText(/Change Stage/i).first().isVisible().catch(() => false);
      const hasLeadJourney = await page.getByText(/Lead Journey/i).first().isVisible().catch(() => false);
      return hasLeadNameSection || hasEditLead || (hasChangeStage && hasLeadJourney);
    }, { timeout: 60000 })
    .toBeTruthy();

  await page.waitForTimeout(1500);
}

export async function openAnyLeadFromListing(page: Page, app: AppConfig) {
  await goToManageLeads(page, app);
  await page.waitForTimeout(3000);
  await waitForListingReady(page);
  await page.waitForTimeout(2000);

  const firstRow = page.locator("table tbody tr").first();
  const firstLeadCell = firstRow.locator("td").nth(1);
  const firstLeadClickableText = firstLeadCell.locator("span, div, p, a").filter({ hasText: /\S/ }).first();

  if (await firstLeadClickableText.isVisible().catch(() => false)) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await firstLeadClickableText.click({ force: true }).catch(async () => {
        await firstLeadCell.click({ force: true, position: { x: 28, y: 18 } });
      });
      const navigated = await page.waitForURL(/engagement-intelligence\/manage-leads\?id=/, { timeout: 15000 }).then(() => true).catch(() => false);
      if (navigated) {
        await waitForLeadProfile(page);
        return;
      }
    }
  }

  const openedFromKnownLink = await clickFirstVisible(page, [
    page.locator('a[href*="engagement-intelligence/manage-leads?id="]'),
    page.locator('a[href*="/manage-leads?id="]'),
    page.getByText(/^L\d+/, { exact: false }),
    page.getByText(/Lead ID/i)
  ]);

  if (!openedFromKnownLink) {
    const openedFromFallback = await clickFirstVisible(page, [
      page.locator("table tbody tr td").filter({ hasText: /[A-Za-z]/ }),
      page.locator('[role="row"]').nth(1),
      page.locator("tbody tr").first()
    ]);

    if (!openedFromFallback) {
      throw new Error("No lead row was available to open from the listing.");
    }
  }

  await waitForLeadProfile(page);
}

export async function editOpenedLeadName(page: Page, nextName?: string): Promise<EditedLead> {
  const editLeadButtonCandidates = [
    page.getByRole("button", { name: /edit lead form/i }),
    page.getByText("Edit Lead Form", { exact: true }),
    page.locator('button:has-text("Edit Lead Form")'),
    page.getByRole("button", { name: /edit lead/i }),
    page.getByText("Edit Lead", { exact: true }),
    page.locator('button:has-text("Edit Lead")')
  ];

  await expect
    .poll(async () => {
      for (const locator of editLeadButtonCandidates) {
        if (await locator.first().isVisible().catch(() => false)) {
          return true;
        }
      }

      return false;
    }, { timeout: 60000 })
    .toBeTruthy();

  await page.waitForTimeout(2000);

  const editLeadOpened = await clickFirstVisible(page, editLeadButtonCandidates);
  if (!editLeadOpened) {
    throw new Error("Edit Lead action was not visible on the lead profile.");
  }

  await expect(page.getByText("Lead Form", { exact: true })).toBeVisible({ timeout: 30000 });

  const fullNameInput = page.locator("#fullName");
  const previousName = (await fullNameInput.inputValue()).trim();
  if (!previousName) {
    throw new Error("Full Name field was empty while editing the lead.");
  }

  const nameLimit = Number(await fullNameInput.getAttribute("maxlength").catch(() => "50")) || 50;
  const updatedName = (nextName ?? `Edited Prefix ${randomDigits(4)} ${previousName}`).slice(0, nameLimit);
  await fullNameInput.fill(updatedName);

  const updatedEmail = "demouser@test.com";
  const emailInputCandidates = [
    page.locator("#email"),
    page.locator('input[name="email"]'),
    page.locator('input[type="email"]'),
    page.getByText(/^Email ID$/i).locator("xpath=following::input[1]"),
    page.getByText(/^Email ID$/i).locator("xpath=ancestor::div[1]/following-sibling::div//input[1]"),
    page.locator('input[placeholder="Enter here"]').nth(2)
  ];

  let emailUpdated = false;
  for (const locator of emailInputCandidates) {
    const input = locator.first();
    if (await input.isVisible().catch(() => false)) {
      await input.scrollIntoViewIfNeeded().catch(() => {});
      await input.fill(updatedEmail);
      emailUpdated = true;
      break;
    }
  }

  if (!emailUpdated) {
    throw new Error("Email field was not visible while editing the lead.");
  }

  await page.locator("#root-modal").getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText("Lead Form", { exact: true })).not.toBeVisible({ timeout: 60000 });
  await expect(page.locator("body")).toContainText(updatedEmail, { timeout: 60000 });

  await page.waitForTimeout(1500);
  const reopenedForVerification = await clickFirstVisible(page, editLeadButtonCandidates);
  if (!reopenedForVerification) {
    throw new Error("Edit Lead action was not visible for post-save verification.");
  }

  await expect(page.getByText("Lead Form", { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(fullNameInput).toHaveValue(updatedName, { timeout: 30000 });

  let verifiedEmailInput: Locator | null = null;
  for (const locator of emailInputCandidates) {
    const input = locator.first();
    if (await input.isVisible().catch(() => false)) {
      verifiedEmailInput = input;
      break;
    }
  }

  if (!verifiedEmailInput) {
    throw new Error("Email field was not visible during post-save verification.");
  }

  await expect(verifiedEmailInput).toHaveValue(updatedEmail, { timeout: 30000 });

  return { previousName, updatedName, updatedEmail };
}

export async function moveOpenedLeadToSiteVisitInProgress(page: Page) {
  await expect(page.getByRole("button", { name: /change stage/i })).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: /change stage/i }).click();

  await expect(page.getByText("Choose a stage", { exact: true })).toBeVisible({ timeout: 30000 });

  const siteVisitStage = page.getByText(/^Site Visit$/i).last();
  await expect(siteVisitStage).toBeVisible({ timeout: 30000 });
  await siteVisitStage.click({ force: true });

  await expect(page.getByText("Choose a sub stage *", { exact: true })).toBeVisible({ timeout: 30000 });
  const inProgressOption = page.getByText(/^In Progress$/i).last();
  await expect(inProgressOption).toBeVisible({ timeout: 30000 });
  await inProgressOption.click({ force: true });

  const modalSave = page.locator("#root-modal").getByRole("button", { name: /^save$/i });
  if (await modalSave.isVisible().catch(() => false)) {
    await modalSave.click();
  } else {
    const genericSave = page.getByRole("button", { name: /^save$/i }).last();
    if (await genericSave.isVisible().catch(() => false)) {
      await genericSave.click();
    }
  }

  await expect
    .poll(async () => {
      const bodyText = await page.locator("body").innerText();
      return /In Progress/i.test(bodyText);
    }, { timeout: 60000 })
    .toBeTruthy();
}

function tomorrowIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function fillVisibleStageFields(page: Page, remark: string) {
  const remarkLocators = [
    page.locator("textarea").first(),
    page.locator('input[placeholder*="Remark" i]').first(),
    page.locator('textarea[placeholder*="Remark" i]').first(),
    page.locator('input[name*="remark" i]').first()
  ];

  for (const locator of remarkLocators) {
    if (await locator.isVisible().catch(() => false)) {
      await locator.fill(remark);
      break;
    }
  }

  const followUpLocators = [
    page.locator('input[type="date"]').first(),
    page.locator('input[placeholder*="Follow" i]').first(),
    page.locator('input[name*="follow" i]').first(),
    page.locator('input[id*="follow" i]').first()
  ];

  for (const locator of followUpLocators) {
    if (await locator.isVisible().catch(() => false)) {
      await locator.fill(tomorrowIsoDate());
      break;
    }
  }

  const followUpTimeLocators = [
    page.locator('input[type="time"]').first(),
    page.locator('input[placeholder*="Time" i]').first(),
    page.locator('input[name*="time" i]').first(),
    page.locator('input[id*="time" i]').first()
  ];

  for (const locator of followUpTimeLocators) {
    if (await locator.isVisible().catch(() => false)) {
      await locator.fill("10:30");
      break;
    }
  }
}

async function clickVisibleSaveButton(page: Page) {
  const saveButtons = [
    page.locator("#root-modal").getByRole("button", { name: /^save$/i }),
    page.getByRole("button", { name: /^save$/i })
  ];

  for (const locator of saveButtons) {
    const count = await locator.count().catch(() => 0);
    for (let index = count - 1; index >= 0; index -= 1) {
      const button = locator.nth(index);
      if (await button.isVisible().catch(() => false)) {
        await button.scrollIntoViewIfNeeded().catch(() => {});
        await button.click({ force: true });
        return true;
      }
    }
  }

  return false;
}

async function scrollJourneySection(page: Page) {
  return await page.evaluate(() => {
    const scrollables = Array.from(document.querySelectorAll("div")).filter((element) => {
      const html = element as HTMLDivElement;
      const style = window.getComputedStyle(html);
      const rect = html.getBoundingClientRect();
      const text = (html.innerText || "").trim();

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        html.scrollHeight > html.clientHeight &&
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        /Lead Journey|New Lead|Open|Qualified|Site Visit|Opportunity/i.test(text)
      );
    });

    for (const element of scrollables) {
      const html = element as HTMLDivElement;
      const previousTop = html.scrollTop;
      html.scrollTop = Math.min(
        html.scrollTop + Math.max(Math.floor(html.clientHeight * 0.8), 220),
        html.scrollHeight
      );

      if (html.scrollTop !== previousTop) {
        return true;
      }
    }

    return false;
  });
}

async function isTabActive(tab: Locator) {
  const className = (await tab.getAttribute("class").catch(() => "")) ?? "";
  const ariaSelected = (await tab.getAttribute("aria-selected").catch(() => "")) ?? "";
  const dataState = (await tab.getAttribute("data-state").catch(() => "")) ?? "";

  return /selected|active|bg-|text-white|shadow/i.test(className) || ariaSelected === "true" || dataState === "active";
}

async function stagePanelIsOpen(page: Page, tabStrip: Locator, changeStageTab: Locator, aiInsightsTab: Locator) {
  const chooseStage = page.getByText("Choose a stage", { exact: true });
  const chooseSubStage = page.getByText("Choose a sub stage *", { exact: true });
  const statusLabel = page.getByText(/^Status$/i).first();

  if (await chooseStage.isVisible().catch(() => false)) {
    return true;
  }

  if (await chooseSubStage.isVisible().catch(() => false)) {
    return true;
  }

  if (await statusLabel.isVisible().catch(() => false)) {
    return true;
  }

  const changeStageActive = await isTabActive(changeStageTab);
  const aiInsightsActive = await isTabActive(aiInsightsTab);

  if (changeStageActive && !aiInsightsActive) {
    const panelText = await tabStrip.locator("xpath=following::div[1]").innerText().catch(() => "");
    return /Choose a stage|Choose a sub stage|Status|Open|Qualified|Site Visit|Opportunity|Dropped/i.test(panelText);
  }

  return false;
}

async function openChangeStageTab(page: Page) {
  const tabStrip = page
    .locator("div")
    .filter({ has: page.getByText("Overview", { exact: true }) })
    .filter({ has: page.getByText("AI Insights", { exact: true }) })
    .filter({ has: page.getByText("Lead Journey", { exact: true }) })
    .filter({ has: page.getByText("Change Stage", { exact: true }) })
    .first();

  const changeStageTab = tabStrip.getByText("Change Stage", { exact: true });
  const aiInsightsTab = tabStrip.getByText("AI Insights", { exact: true });
  await expect(changeStageTab).toBeVisible({ timeout: 60000 });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await changeStageTab.scrollIntoViewIfNeeded().catch(() => {});
    await changeStageTab.click({ force: true });
    await page.waitForTimeout(1200);
    const opened = await stagePanelIsOpen(page, tabStrip, changeStageTab, aiInsightsTab);

    if (opened) {
      return;
    }

    await changeStageTab.click({ force: true, position: { x: 18, y: 18 } }).catch(() => {});
    await page.waitForTimeout(1400);
    const reopened = await stagePanelIsOpen(page, tabStrip, changeStageTab, aiInsightsTab);

    if (reopened) {
      return;
    }
  }

  throw new Error('Change Stage tab did not open the "Choose a stage" view.');
}

export async function moveLeadThroughStages(page: Page, transitions: StageTransition[]) {
  await openChangeStageTab(page);

  for (const transition of transitions) {
    const stageChip = page.getByText(new RegExp(`^${transition.stage}$`, "i")).last();
    await expect(stageChip).toBeVisible({ timeout: 30000 });
    await stageChip.click({ force: true });
    await page.waitForTimeout(1000);

    await fillVisibleStageFields(page, transition.remark);

    const saved = await clickVisibleSaveButton(page);
    if (!saved) {
      throw new Error(`Save button was not visible after selecting stage "${transition.stage}".`);
    }

    await expect
      .poll(async () => {
        const bodyText = await page.locator("body").innerText();
        return new RegExp(transition.stage, "i").test(bodyText);
      }, { timeout: 60000 })
      .toBeTruthy();

    await openChangeStageTab(page);
  }
}

export async function assertLeadJourneyStages(page: Page, stages: string[]) {
  const leadJourneyTab = page.getByText("Lead Journey", { exact: true });
  await expect(leadJourneyTab).toBeVisible({ timeout: 30000 });
  await leadJourneyTab.click();
  await page.waitForTimeout(1000);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bodyText = await page.locator("body").innerText();
    if (stages.every((stage) => new RegExp(stage, "i").test(bodyText))) {
      return;
    }

    const scrolled = await scrollJourneySection(page);
    if (!scrolled) {
      break;
    }

    await page.waitForTimeout(600);
  }

  const finalBodyText = await page.locator("body").innerText();
  for (const stage of stages) {
    expect(finalBodyText).toMatch(new RegExp(stage, "i"));
  }
}
