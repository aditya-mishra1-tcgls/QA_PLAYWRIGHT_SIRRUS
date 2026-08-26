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

type AddedRemark = {
  text: string;
};

type CostSheetRenderResult = {
  emptyStateText: string;
};

type ReEnquiryResult = {
  source: string;
  subSource: string;
};

type CommentPanelResult = {
  panelTitle: string;
};

type StageTransition = {
  stage: string;
  remark: string;
};

const FALLBACK_RENDER_WAIT_MS = 3000;

async function clickWithFallback(
  page: Page,
  locator: Locator,
  postCheck?: () => Promise<boolean>,
  options?: Parameters<Locator["click"]>[0]
) {
  await locator.click(options);

  if (!postCheck) {
    return;
  }

  const ready = await expect
    .poll(postCheck, { timeout: 1500 })
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);

  if (!ready) {
    await page.waitForTimeout(FALLBACK_RENDER_WAIT_MS);
  }
}

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
  const engagementModuleButton = page
    .locator("button")
    .filter({
      has: page.locator('img[alt*="engagement" i], img[alt*="Engagement" i]')
    })
    .first();

  await expect(engagementModuleButton).toBeVisible({ timeout: 60000 });
  await clickWithFallback(
    page,
    engagementModuleButton,
    async () => await page.getByRole("button", { name: /manage leads/i }).isVisible().catch(() => false)
  );
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
  await clickWithFallback(
    page,
    addLeadButton,
    async () => {
      const leadFormVisible = await page.getByText("Lead Form", { exact: true }).isVisible().catch(() => false);
      const nestedAddLeadVisible = await page.getByText("Add Lead", { exact: true }).last().isVisible().catch(() => false);
      return leadFormVisible || nestedAddLeadVisible;
    }
  );

  const leadForm = page.getByText("Lead Form", { exact: true });
  if (!await leadForm.isVisible().catch(() => false)) {
    await page.waitForTimeout(800);
    await clickNestedAddLeadAction(page);
  }

  await expect(leadForm).toBeVisible({ timeout: 30000 });

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

  const leadLinkCandidates = [
    page.getByRole("link", { name: new RegExp(`^${leadName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).first(),
    page.locator('a[href*="manage-leads/?id="]').filter({ hasText: new RegExp(`^${leadName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).first(),
    page.getByText(new RegExp(`^${leadName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")).first()
  ];

  let opened = false;
  for (const candidate of leadLinkCandidates) {
    if (!await candidate.isVisible().catch(() => false)) {
      continue;
    }

    await candidate.click({ force: true }).catch(() => {});
    opened = await page.waitForURL(/engagement-intelligence\/manage-leads\/?\?id=/, { timeout: 15000 }).then(() => true).catch(() => false);
    if (opened) {
      break;
    }
  }

  if (!opened) {
    throw new Error(`Could not open lead profile for "${leadName}" from the lead listing.`);
  }

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

async function clickNestedAddLeadAction(page: Page) {
  const nestedAddLeadCandidates = [
    page.locator("button").filter({ hasText: /^Add Lead$/i }).last(),
    page.locator('[role="menuitem"]').filter({ hasText: /^Add Lead$/i }).last(),
    page.locator("div").filter({ hasText: /^Add Lead$/i }).last(),
    page.getByText("Add Lead", { exact: true }).last()
  ];

  for (const candidate of nestedAddLeadCandidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ force: true });
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
  await page.waitForURL(/engagement-intelligence\/manage-leads\/?\?id=/, { timeout: 30000 });

  await expect(page.getByText(/Lead Profile/i).first()).toBeVisible({ timeout: 60000 });

  await expect
    .poll(async () => {
      const bodyText = await page.locator("body").innerText();
      return /Lead ID\s*:|Edit Lead Form|Change Stage|Lead Journey|Full Name\s*:|Lead Profile/i.test(bodyText);
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

export async function addRemarkToOpenedLead(page: Page, remarkText?: string): Promise<AddedRemark> {
  const finalRemark = remarkText ?? `Automation remark ${randomDigits(6)}`;
  const addRemarkButtonCandidates = [
    page.getByRole("button", { name: /add remark/i }),
    page.getByRole("button", { name: /add comment/i }),
    page.getByText("Add Remark", { exact: true }),
    page.getByText("Add comment", { exact: true })
  ];

  const opened = await clickFirstVisible(page, addRemarkButtonCandidates);
  if (!opened) {
    throw new Error("Add Remark action was not visible on the lead profile.");
  }

  const remarkInputCandidates = [
    page.getByRole("textbox", { name: /remark/i }).first(),
    page.locator("textarea").first(),
    page.locator('textarea[name*="remark" i]').first()
  ];

  let remarkInput: Locator | null = null;
  for (const locator of remarkInputCandidates) {
    if (await locator.isVisible().catch(() => false)) {
      remarkInput = locator;
      break;
    }
  }

  if (!remarkInput) {
    throw new Error("Remark input was not visible after opening the Add Remark flow.");
  }

  await remarkInput.scrollIntoViewIfNeeded().catch(() => {});
  await remarkInput.fill(finalRemark);

  const saveButtons = [
    page.locator("#root-modal").getByRole("button", { name: /^save$/i }),
    page.getByRole("button", { name: /^save$/i })
  ];

  let saved = false;
  for (const locator of saveButtons) {
    const count = await locator.count().catch(() => 0);
    for (let index = count - 1; index >= 0; index -= 1) {
      const button = locator.nth(index);
      if (await button.isVisible().catch(() => false)) {
        await button.click({ force: true });
        saved = true;
        break;
      }
    }

    if (saved) {
      break;
    }
  }

  if (!saved) {
    throw new Error("Save button was not visible in the Add Remark flow.");
  }

  await expect
    .poll(async () => {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      return bodyText.includes(finalRemark);
    }, { timeout: 60000 })
    .toBeTruthy();

  return { text: finalRemark };
}

export async function assertGenerateCostSheetRenderingOnOpenedLead(page: Page): Promise<CostSheetRenderResult> {
  const tabStrip = page
    .locator("div")
    .filter({ has: page.getByText("Overview", { exact: true }) })
    .filter({ has: page.getByText("AI Insights", { exact: true }) })
    .filter({ has: page.getByText("Change Stage", { exact: true }) })
    .first();

  const aiInsightsTab = tabStrip.getByText("AI Insights", { exact: true });
  await expect(aiInsightsTab).toBeVisible({ timeout: 60000 });
  await aiInsightsTab.click({ force: true });

  const quotationsTab = page.getByRole("button", { name: /^quotations$/i }).first();
  await expect(quotationsTab).toBeVisible({ timeout: 60000 });
  await quotationsTab.click({ force: true });

  const generateCostSheetButton = page.getByRole("button", { name: /generate cost sheet/i }).first();
  await expect(generateCostSheetButton).toBeVisible({ timeout: 60000 });
  await generateCostSheetButton.click({ force: true });

  const emptyState = page.getByText(/No Master Cost Sheet/i).first();
  await expect(emptyState).toBeVisible({ timeout: 60000 });

  return { emptyStateText: await emptyState.innerText() };
}

export async function assertAddCommentPanelOnOpenedLead(page: Page): Promise<CommentPanelResult> {
  const addCommentButtonCandidates = [
    page.getByRole("button", { name: /add comment/i }),
    page.getByText("Add comment", { exact: true }),
    page.locator('button:has-text("Add comment")')
  ];

  const opened = await clickFirstVisible(page, addCommentButtonCandidates);
  if (!opened) {
    throw new Error("Add comment action was not visible on the lead profile.");
  }

  const panelTitle = page.getByText(/Add comment and followup/i).first();
  await expect(panelTitle).toBeVisible({ timeout: 60000 });

  return { panelTitle: await panelTitle.innerText() };
}

export async function addReEnquiryToOpenedLead(
  page: Page,
  source = "Direct Site Visit",
  subSource = "Walk In"
): Promise<ReEnquiryResult> {
  const reEnquiryButtonCandidates = [
    page.getByRole("button", { name: /^re-enquiry/i }),
    page.getByText(/^Re-Enquiry/i).first(),
    page.getByRole("button", { name: /add re-enquiry/i }),
    page.getByText("Add Re-Enquiry", { exact: true }),
    page.locator('button:has-text("Add Re-Enquiry")')
  ];

  const opened = await clickFirstVisible(page, reEnquiryButtonCandidates);
  if (!opened) {
    throw new Error("Add Re-Enquiry action was not visible on the lead profile.");
  }

  const sourceButton = page.getByRole("button", { name: /select source/i }).first();
  await expect(sourceButton).toBeVisible({ timeout: 30000 });
  await sourceButton.click({ force: true });

  const sourceOption = page.getByRole("button", { name: new RegExp(`^${source}$`, "i") }).first();
  await expect(sourceOption).toBeVisible({ timeout: 30000 });
  await sourceOption.click({ force: true });

  const subSourceButton = page.getByRole("button", { name: /select sub source/i }).first();
  await expect(subSourceButton).toBeVisible({ timeout: 30000 });
  await subSourceButton.click({ force: true });

  const subSourceOption = page.getByRole("button", { name: new RegExp(`^${subSource}$`, "i") }).first();
  await expect(subSourceOption).toBeVisible({ timeout: 30000 });
  await subSourceOption.click({ force: true });

  const saveButtonCandidates = [
    page.getByRole("button", { name: /^save$/i }).last(),
    page.getByRole("button", { name: /^SAVE$/ }).last()
  ];

  let saved = false;
  for (const button of saveButtonCandidates) {
    if (await button.isVisible().catch(() => false)) {
      await button.click({ force: true });
      saved = true;
      break;
    }
  }

  if (!saved) {
    throw new Error("Save button was not visible in the re-enquiry flow.");
  }

  await expect(page.getByText("Lead Journey", { exact: true })).toBeVisible({ timeout: 60000 });

  return { source, subSource };
}

export async function moveOpenedLeadToSiteVisitInProgress(page: Page) {
  await expect(page.getByRole("button", { name: /change stage/i })).toBeVisible({ timeout: 60000 });
  await clickWithFallback(
    page,
    page.getByRole("button", { name: /change stage/i }),
    async () => await page.getByText("Choose a stage", { exact: true }).isVisible().catch(() => false)
  );

  await expect(page.getByText("Choose a stage", { exact: true })).toBeVisible({ timeout: 30000 });

  const siteVisitStage = page.getByText(/^Site Visit$/i).last();
  await expect(siteVisitStage).toBeVisible({ timeout: 30000 });
  await clickWithFallback(
    page,
    siteVisitStage,
    async () => {
      const subStageVisible = await page.getByText("Choose a sub stage *", { exact: true }).isVisible().catch(() => false);
      const dateVisible = await page.getByText(/^Select Date \*$/i).isVisible().catch(() => false);
      return subStageVisible || dateVisible;
    },
    { force: true }
  );

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

export async function assertSiteVisitStageCasesOnOpenedLead(page: Page) {
  await openChangeStageTab(page);

  const siteVisitStage = page.locator("button, div").filter({ hasText: /^Site Visit$/i }).last();
  await expect(siteVisitStage).toBeVisible({ timeout: 30000 });
  await clickWithFallback(
    page,
    siteVisitStage,
    async () => await page.getByRole("button", { name: /start date/i }).first().isVisible().catch(() => false),
    { force: true }
  );

  await fillSiteVisitBookingFields(page);
  const booked = await clickVisibleSaveButton(page);
  if (!booked) {
    throw new Error('Save button was not visible after selecting "Site Visit" and entering booking details.');
  }

  await expect
    .poll(async () => {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      return /Site Visit/i.test(bodyText);
    }, { timeout: 60000 })
    .toBeTruthy();
}

function addDaysToCurrentDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function tomorrowIsoDate() {
  return addDaysToCurrentDate(1).toISOString().slice(0, 10);
}

function siteVisitIsoDate() {
  return addDaysToCurrentDate(3).toISOString().slice(0, 10);
}

function dateOptionName(daysAhead: number) {
  const date = addDaysToCurrentDate(daysAhead);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
  const day = date.getDate();
  const remainder10 = day % 10;
  const remainder100 = day % 100;
  const suffix = remainder10 === 1 && remainder100 !== 11
    ? "st"
    : remainder10 === 2 && remainder100 !== 12
      ? "nd"
      : remainder10 === 3 && remainder100 !== 13
        ? "rd"
        : "th";

  return new RegExp(`^Choose ${weekday}, ${month} ${day}${suffix},`, "i");
}

async function fillFirstVisibleField(page: Page, locators: Locator[], value: string) {
  for (const locator of locators) {
    if (await locator.isVisible().catch(() => false)) {
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.fill(value);
      return true;
    }
  }

  return false;
}

async function fillSiteVisitBookingFields(page: Page) {
  const startDateButton = page.getByRole("button", { name: /start date/i }).first();
  const remarkFieldCandidates = [
    page.getByRole("textbox", { name: /remarks/i }).first(),
    page.locator("textarea").first(),
    page.locator('input[name*="remark" i]').first()
  ];
  const siteVisitDateLocators = [
    startDateButton,
    page.getByPlaceholder(/start date/i).first(),
    page.locator('input[id*="visit"][type="date" i]').first(),
    page.locator('input[name*="visit"][type="date" i]').first(),
    page.locator('input[placeholder*="visit" i]').first(),
    page.locator('input[id*="schedule"][type="date" i]').first(),
    page.locator('input[name*="schedule"][type="date" i]').first(),
    page.locator('input[placeholder*="date" i]').first(),
    page.locator('input[type="date"]').first()
  ];

  const dateFieldVisible = await expect
    .poll(async () => {
      return await Promise.all(siteVisitDateLocators.map(async (locator) => await locator.isVisible().catch(() => false)));
    }, { timeout: 4000 })
    .toContain(true)
    .then(() => true)
    .catch(() => false);

  if (!dateFieldVisible) {
    await page.waitForTimeout(FALLBACK_RENDER_WAIT_MS);
  }

  const dateFilled = await selectSiteVisitDate(page, startDateButton, siteVisitDateLocators);
  const remarkFilled = await fillSiteVisitRemark(page, remarkFieldCandidates, "user will come for site visit.");

  if (!dateFilled || !remarkFilled) {
    throw new Error("Site visit booking date or remarks were not ready after selecting Site Visit.");
  }
}

async function selectSiteVisitDate(page: Page, startDateButton: Locator, locators: Locator[]) {
  if (await startDateButton.isVisible().catch(() => false)) {
    await clickWithFallback(
      page,
      startDateButton,
      async () => await page.getByRole("option", { name: dateOptionName(3) }).first().isVisible().catch(() => false)
    );

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const dateOption = page.getByRole("option", { name: dateOptionName(3) }).first();
      if (await dateOption.isVisible().catch(() => false)) {
        await dateOption.click({ force: true });
        return true;
      }

      const scrolled = await scrollVisiblePopup(page);
      if (!scrolled) {
        break;
      }
      await page.waitForTimeout(400);
    }
  }

  return await fillFirstVisibleField(page, locators, siteVisitIsoDate());
}

async function fillSiteVisitRemark(page: Page, locators: Locator[], remark: string) {
  for (const locator of locators) {
    if (!await locator.isVisible().catch(() => false)) {
      continue;
    }

    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click().catch(() => {});
    await locator.fill(remark);
    return true;
  }

  return false;
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
    await clickWithFallback(page, changeStageTab, async () => await stagePanelIsOpen(page, tabStrip, changeStageTab, aiInsightsTab), { force: true });
    const opened = await stagePanelIsOpen(page, tabStrip, changeStageTab, aiInsightsTab);

    if (opened) {
      return;
    }

    await clickWithFallback(
      page,
      changeStageTab,
      async () => await stagePanelIsOpen(page, tabStrip, changeStageTab, aiInsightsTab),
      { force: true, position: { x: 18, y: 18 } }
    ).catch(() => {});
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

    if (/^site visit$/i.test(transition.stage)) {
      await fillSiteVisitBookingFields(page);
    }

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
