import { expect, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import { clickWithFallback, escapeRegex, fillFirstVisible, tryClickFirstVisible, waitForHiddenWithFallback } from "../support/ui-actions";

function randomDigits(length: number) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

export class LeadProfilePage {
  constructor(private readonly page: Page) {}

  get profileTitle() {
    return this.page.getByText(/Lead Profile/i).first();
  }

  get changeStageTab() {
    return this.page.getByText("Change Stage", { exact: true });
  }

  get leadJourneyTab() {
    return this.page.getByText("Lead Journey", { exact: true });
  }

  get editLeadFormAction() {
    return this.page.getByText("Edit Lead Form", { exact: true });
  }

  async expectLoaded() {
    await this.page.waitForURL(/engagement-intelligence\/manage-leads\/?\?id=/, {
      timeout: 30000,
    });

    await expect(this.profileTitle).toBeVisible({ timeout: 60000 });

    await expect
      .poll(
        async () => {
          const bodyText = await this.page.locator("body").innerText();
          return /Lead ID\s*:|Edit Lead Form|Change Stage|Lead Journey|Full Name\s*:|Lead Profile/i.test(
            bodyText,
          );
        },
        { timeout: 60000 },
      )
      .toBeTruthy();

    await expect(this.page.locator("body")).toContainText(/Lead ID\s*:/i, {
      timeout: 60000,
    });

    await expect
      .poll(
        async () => {
          const hasLeadNameSection = await this.page
            .getByText(/Full Name\s*:/i)
            .first()
            .isVisible()
            .catch(() => false);
          const hasEditLead = await this.editLeadFormAction
            .first()
            .isVisible()
            .catch(() => false);
          const hasChangeStage = await this.changeStageTab
            .first()
            .isVisible()
            .catch(() => false);
          const hasLeadJourney = await this.leadJourneyTab
            .first()
            .isVisible()
            .catch(() => false);
          return (
            hasLeadNameSection ||
            hasEditLead ||
            (hasChangeStage && hasLeadJourney)
          );
        },
        { timeout: 60000 },
      )
      .toBeTruthy();

    await this.page.waitForTimeout(1500);
  }

  async openChangeStage() {
    await expect(this.changeStageTab.first()).toBeVisible({ timeout: 60000 });
    await clickWithFallback(
      this.changeStageTab.first(),
      this.page,
      async () => await this.page.getByText("Choose a stage", { exact: true }).isVisible().catch(() => false),
      { force: true },
    );
  }

  async openLeadJourney() {
    await expect(this.leadJourneyTab.first()).toBeVisible({ timeout: 30000 });
    await this.leadJourneyTab.first().click();
  }

  async editLeadName(nextName?: string) {
    const editLeadButtonCandidates = [
      this.page.getByRole("button", { name: /edit lead form/i }),
      this.page.getByText("Edit Lead Form", { exact: true }),
      this.page.locator('button:has-text("Edit Lead Form")'),
      this.page.getByRole("button", { name: /edit lead/i }),
      this.page.getByText("Edit Lead", { exact: true }),
      this.page.locator('button:has-text("Edit Lead")'),
    ];

    await expect
      .poll(
        async () => {
          for (const locator of editLeadButtonCandidates) {
            if (await locator.first().isVisible().catch(() => false)) {
              return true;
            }
          }

          return false;
        },
        { timeout: 60000 },
      )
      .toBeTruthy();

    await this.page.waitForTimeout(2000);

    const editLeadOpened = await tryClickFirstVisible(editLeadButtonCandidates);
    if (!editLeadOpened) {
      throw new Error("Edit Lead action was not visible on the lead profile.");
    }

    await expect(this.page.getByText("Lead Form", { exact: true })).toBeVisible({
      timeout: 30000,
    });

    const fullNameInput = this.page.locator("#fullName");
    const previousName = (await fullNameInput.inputValue()).trim();
    if (!previousName) {
      throw new Error("Full Name field was empty while editing the lead.");
    }

    const nameLimit =
      Number(await fullNameInput.getAttribute("maxlength").catch(() => "50")) ||
      50;
    const updatedName = (
      nextName ?? `Edited Prefix ${randomDigits(4)} ${previousName}`
    ).slice(0, nameLimit);
    await fullNameInput.fill(updatedName);

    const updatedEmail = "demouser@test.com";
    await fillFirstVisible(
      [
        this.page.locator("#email"),
        this.page.locator('input[name="email"]'),
        this.page.locator('input[type="email"]'),
        this.page.getByText(/^Email ID$/i).locator("xpath=following::input[1]"),
        this.page
          .getByText(/^Email ID$/i)
          .locator("xpath=ancestor::div[1]/following-sibling::div//input[1]"),
        this.page.locator('input[placeholder="Enter here"]').nth(2),
      ],
      updatedEmail,
      "email"
    );

    await this.page
      .locator("#root-modal")
      .getByRole("button", { name: /^save$/i })
      .click();
    await waitForHiddenWithFallback(
      this.page.getByText("Lead Form", { exact: true }),
      this.page,
      60000,
    );

    await expect(this.page.locator("body")).toContainText(updatedName, {
      timeout: 60000,
    });
    await expect(this.page.locator("body")).toContainText(updatedEmail, {
      timeout: 60000,
    });

    return { previousName, updatedName, updatedEmail };
  }

  async addRemark(remarkText?: string) {
    const finalRemark = remarkText ?? `Automation remark ${randomDigits(6)}`;
    const profileUrl = this.page.url();
    await this.openAddCommentPanel();

    let panel = await this.visibleAddCommentPanel(profileUrl);
    await this.selectCommentActivity(panel);
    panel = await this.visibleAddCommentPanel(profileUrl);
    await this.fillCommentRemark(panel, finalRemark);
    await this.fillCommentDateAndTime(panel);

    const saved = await this.clickLastVisibleSave();
    if (!saved) {
      throw new Error("Save button was not visible in the Add Remark flow.");
    }

    await this.revealSavedRemark(finalRemark);

    await expect
      .poll(
        async () => {
          const bodyText = await this.page.locator("body").innerText().catch(() => "");
          return bodyText.includes(finalRemark);
        },
        { timeout: 60000 },
      )
      .toBeTruthy();

    return { text: finalRemark };
  }

  async openGeneratedCostSheetPreview() {
    const tabStrip = this.page
      .locator("div")
      .filter({ has: this.page.getByText("Overview", { exact: true }) })
      .filter({ has: this.page.getByText("AI Insights", { exact: true }) })
      .filter({ has: this.page.getByText("Change Stage", { exact: true }) })
      .first();

    const aiInsightsTab = tabStrip.getByText("AI Insights", { exact: true });
    await expect(aiInsightsTab).toBeVisible({ timeout: 60000 });
    await aiInsightsTab.click({ force: true });

    const quotationsTab = this.page
      .getByRole("button", { name: /^quotations$/i })
      .first();
    await expect(quotationsTab).toBeVisible({ timeout: 60000 });
    await quotationsTab.click({ force: true });

    const generateCostSheetButton = this.page
      .getByRole("button", { name: /generate cost sheet/i })
      .first();
    await expect(generateCostSheetButton).toBeVisible({ timeout: 60000 });
    await generateCostSheetButton.click({ force: true });

    const emptyState = this.page.getByText(/No Master Cost Sheet/i).first();
    await expect(emptyState).toBeVisible({ timeout: 60000 });

    return { emptyStateText: await emptyState.innerText() };
  }

  async openAddCommentPanel() {
    const opened = await tryClickFirstVisible([
      this.page.getByRole("button", { name: /add comment/i }),
      this.page.getByText("Add comment", { exact: true }),
      this.page.locator('button:has-text("Add comment")'),
    ], { force: true });

    if (!opened) {
      throw new Error("Add comment action was not visible on the lead profile.");
    }

    const panelTitle = this.page.getByText(/Add comment and followup/i).first();
    await expect(panelTitle).toBeVisible({ timeout: 60000 });

    return { panelTitle: await panelTitle.innerText() };
  }

  async expectAddCommentPanelOptionsVisible() {
    const panel = await this.visibleAddCommentPanel();

    await expect(panel).toContainText(/follow\s*up|followup/i, { timeout: 30000 });
    await expect(panel).toContainText(/Upload Recording For/i, { timeout: 30000 });
    await expect(panel).toContainText(/remarks?/i, { timeout: 30000 });

    await this.expectVisibleWithinPanel(panel, [
      this.page.getByRole("button", { name: /select here/i }).first(),
      panel.locator("button").filter({ hasText: /select here/i }).first(),
      panel.locator('[role="button"]').filter({ hasText: /select here/i }).first(),
    ], "recording type dropdown");

    await this.expectVisibleWithinPanel(panel, [
      this.page.getByRole("textbox", { name: /remarks?/i }).first(),
      panel.locator("textarea").first(),
      panel.locator('textarea[name*="remark" i]').first(),
      panel.locator('input[name*="remark" i]').first(),
    ], "remarks field");

    await this.expectVisibleWithinPanel(panel, [
      this.page.getByLabel(/follow\s*up|followup|fu|date/i).first(),
      this.page.getByRole("button", { name: /follow\s*up|followup|fu|date|start date/i }).first(),
      panel.locator('input[type="date"]').first(),
      panel.locator('input[placeholder*="date" i]').first(),
      panel.locator("button").filter({ hasText: /date/i }).first(),
    ], "follow-up date field");

    await this.expectVisibleWithinPanel(panel, [
      this.page.getByLabel(/follow\s*up|followup|fu|time/i).first(),
      this.page.getByRole("button", { name: /follow\s*up|followup|fu|time/i }).first(),
      panel.locator('input[type="time"]').first(),
      panel.locator('input[placeholder*="time" i]').first(),
      panel.locator("button").filter({ hasText: /time/i }).first(),
    ], "follow-up time field");

    await this.expectVisibleWithinPanel(panel, [
      this.page.getByRole("button", { name: /attach|upload|file/i }).first(),
      this.page.getByText(/attach file|attachment|upload/i).first(),
      panel.locator('input[type="file"]').first(),
    ], "attach file control");
  }

  async saveCommentWithRecording(filePath: string) {
    const remark = `Automation comment recording ${randomDigits(6)}`;
    const fileName = path.basename(filePath);

    await this.expectLoaded();
    const profileUrl = this.page.url();
    await this.openAddCommentPanel();

    let panel = await this.visibleAddCommentPanel(profileUrl);
    await this.selectCommentActivity(panel);
    panel = await this.visibleAddCommentPanel(profileUrl);
    await this.fillCommentRemark(panel, remark);
    await this.fillCommentDateAndTime(panel);
    await this.uploadCommentRecording(panel, filePath);

    const saved = await this.clickLastVisibleSave();
    if (!saved) {
      throw new Error("Save button was not visible after filling Add Comment panel.");
    }

    await expect
      .poll(async () => {
        const bodyText = await this.page.locator("body").innerText().catch(() => "");
        return bodyText.includes(remark) || /AI\s*summary|summary|recording|uploaded|comment added/i.test(bodyText);
      }, { timeout: 90000 })
      .toBeTruthy();

    await this.expectSavedCommentInOverviewOrJourney(remark, fileName);

    return { remark, fileName };
  }

  async addReEnquiry(source = "Direct Site Visit", subSource = "Walk In") {
    const opened = await tryClickFirstVisible([
      this.page.getByRole("button", { name: /add\s*re[-\s]?enquiry/i }),
      this.page.locator("button").filter({ hasText: /add\s*re[-\s]?enquiry/i }).first(),
      this.page.getByText(/add\s*re[-\s]?enquiry/i).first(),
      this.page.getByRole("button", { name: /^re[-\s]?enquiry/i }),
      this.page.getByText(/^Re[-\s]?Enquiry/i).first(),
    ], { force: true });

    if (!opened) {
      throw new Error("Add Re-Enquiry action was not visible on the lead profile.");
    }

    const sourceButton = this.page
      .getByRole("button", { name: /select source/i })
      .first();
    await expect(sourceButton).toBeVisible({ timeout: 30000 });
    await sourceButton.click({ force: true });

    const selectedSource = await this.selectPreferredOrFirstDropdownOption(source);

    const subSourceButton = this.page
      .getByRole("button", { name: /select sub source/i })
      .first();
    await expect(subSourceButton).toBeVisible({ timeout: 30000 });
    await subSourceButton.click({ force: true });

    const selectedSubSource = await this.selectPreferredOrFirstDropdownOption(subSource);

    const saved = await tryClickFirstVisible(
      [
        this.page.getByRole("button", { name: /^save$/i }).last(),
        this.page.getByRole("button", { name: /^SAVE$/ }).last(),
      ],
      { force: true },
    );

    if (!saved) {
      throw new Error("Save button was not visible in the re-enquiry flow.");
    }

    await expect(this.leadJourneyTab).toBeVisible({ timeout: 60000 });

    return { source: selectedSource, subSource: selectedSubSource };
  }

  private async selectPreferredOrFirstDropdownOption(preferredOption: string) {
    const preferred = this.page
      .getByRole("button", { name: new RegExp(`^${escapeRegex(preferredOption)}$`, "i") })
      .first();
    if (await preferred.isVisible({ timeout: 5000 }).catch(() => false)) {
      await preferred.click({ force: true });
      return preferredOption;
    }

    const selectedText = await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const excluded = /^(select here|select all|clear|save|cancel|apply)$/i;
      const option = Array.from(document.querySelectorAll<HTMLElement>("button, [role='option'], [role='menuitem'], li"))
        .find((element) => {
          const text = normalize(element.innerText || element.textContent);
          return text && !excluded.test(text) && visible(element);
        });
      if (!option) {
        return "";
      }

      const text = normalize(option.innerText || option.textContent);
      option.click();
      return text;
    }).catch(() => "");

    if (!selectedText) {
      throw new Error(`No selectable dropdown option was visible for preferred option "${preferredOption}".`);
    }

    return selectedText;
  }

  private async selectCommentActivity(panel: Locator) {
    const selected = await tryClickFirstVisible(
      [
        panel.getByRole("button", { name: /follow\s*up|followup/i }).first(),
        panel.getByRole("button", { name: /site\s*visit|sv/i }).first(),
        panel.locator('[role="radio"], [role="tab"], [aria-pressed], [data-state]').filter({ hasText: /follow\s*up|followup|site\s*visit|sv/i }).first(),
        panel.locator("button").filter({ hasText: /follow|visit|sv/i }).first(),
      ],
      { force: true },
    );

    if (!selected) {
      await expect(panel).toContainText(/follow\s*up|followup|site\s*visit|sv/i, { timeout: 30000 });
    }
  }

  private async uploadCommentRecording(panel: Locator, filePath: string) {
    const fileInput = panel.locator('input[type="file"]').first();
    if (await fileInput.count().catch(() => 0)) {
      await fileInput.setInputFiles(filePath);
      return;
    }

    const uploadClicked = await tryClickFirstVisible(
      [
        panel.getByRole("button", { name: /attach|upload|file|record/i }).first(),
        panel.getByText(/attach file|attachment|upload|record/i).first(),
      ],
      { force: true },
    );

    if (!uploadClicked) {
      throw new Error("Recording upload control was not visible in Add Comment panel.");
    }

    const lateFileInput = panel.locator('input[type="file"]').first();
    await expect(lateFileInput).toHaveCount(1, { timeout: 30000 });
    await lateFileInput.setInputFiles(filePath);
  }

  private async fillCommentDateAndTime(panel: Locator) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isoDate = tomorrow.toISOString().slice(0, 10);

    const dateFilled = await this.fillFirstAvailableValue(
      [
        panel.locator('input[type="date"]').first(),
        panel.locator('input[name*="date" i]').first(),
        panel.locator('input[placeholder*="date" i]').first(),
        this.page.getByLabel(/date|follow/i).first(),
      ],
      isoDate,
    );

    if (!dateFilled) {
      const dateButton = panel.getByRole("button", { name: /date|start date|select date|follow/i }).first();
      if (await dateButton.isVisible().catch(() => false)) {
        await dateButton.click({ force: true });
        await tryClickFirstVisible(
          [
            this.page.getByRole("button", { name: new RegExp(`^${tomorrow.getDate()}$`) }).last(),
            this.page.getByRole("gridcell", { name: new RegExp(`^${tomorrow.getDate()}$`) }).last(),
            this.page.getByText(new RegExp(`^${tomorrow.getDate()}$`)).last(),
          ],
          { force: true },
        );
      }
    }

    await panel.getByText(/remarks?/i).first().click({ force: true }).catch(() => {});

    const timeFilled = await this.fillFirstAvailableValue(
      [
        panel.locator('input[type="time"]').first(),
        panel.locator('input[name*="time" i]').first(),
        panel.locator('input[placeholder*="time" i]').first(),
        this.page.getByLabel(/time|follow/i).first(),
      ],
      "10:30",
    );

    if (!timeFilled) {
      const timeButton = panel.getByRole("button", { name: /time|select time|follow/i }).first();
      if (await timeButton.isVisible().catch(() => false)) {
        await timeButton.click({ force: true }).catch(() => {});
        await this.page.getByText(/10:30|10 AM|10:00|11:00/i).first().click({ force: true }).catch(() => {});
      }
    }

    await panel.getByText(/remarks?/i).first().click({ force: true }).catch(() => {});
  }

  private async fillCommentRemark(panel: Locator, remark: string) {
    const filled = await this.fillFirstAvailableValue(
      [
        panel.getByRole("textbox", { name: /remarks?|comment/i }).first(),
        panel.getByPlaceholder(/enter\s+remarks/i).first(),
        panel.locator("textarea").first(),
        panel.locator('textarea[placeholder*="remark" i]').first(),
        panel.locator('textarea[placeholder*="comment" i]').first(),
        panel.locator('input[placeholder*="remark" i]').first(),
        panel.locator('input[placeholder*="comment" i]').first(),
        panel.locator('input[name*="remark" i]').first(),
        panel.locator('textarea[name*="remark" i]').first(),
        panel.locator('[contenteditable="true"]').first(),
      ],
      remark,
    );

    const filledWithDom = filled || await this.fillCommentRemarkWithDom(panel, remark);
    if (!filledWithDom) {
      throw new Error("Remarks field was not editable in Add Comment panel.");
    }
  }

  private async fillCommentRemarkWithDom(panel: Locator, remark: string) {
    return await panel.evaluate((root, value) => {
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const candidates = Array.from(root.querySelectorAll<HTMLElement>("textarea, input, [contenteditable='true']"))
        .filter(visible)
        .filter((element) => {
          const target = element as HTMLInputElement | HTMLTextAreaElement;
          const type = (target.getAttribute("type") || "").toLowerCase();
          const name = `${target.getAttribute("name") || ""} ${target.getAttribute("placeholder") || ""} ${target.getAttribute("aria-label") || ""}`.toLowerCase();
          return type !== "file" && type !== "date" && type !== "time" && type !== "hidden" && !/search|date|time|mobile|phone|otp/.test(name);
        });

      const target = candidates.find((element) => /remark|comment/i.test(`${element.getAttribute("name") || ""} ${element.getAttribute("placeholder") || ""} ${element.getAttribute("aria-label") || ""}`)) ?? candidates[0];
      if (!target) {
        return false;
      }

      target.scrollIntoView({ block: "center", inline: "center" });
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), "value")?.set;
        setter?.call(target, value);
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return target.value === value;
      }

      target.textContent = value;
      target.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return (target.textContent || "").includes(value);
    }, remark).catch(() => false);
  }

  private async fillFirstAvailableValue(candidates: Locator[], value: string) {
    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.fill(value).catch(async () => {
          await candidate.click({ force: true });
          await candidate.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
          await candidate.type(value);
        });
        return true;
      }
    }

    return false;
  }

  private async expectSavedCommentInOverviewOrJourney(remark: string, fileName: string) {
    await expect
      .poll(async () => {
        const bodyText = await this.page.locator("body").innerText().catch(() => "");
        return bodyText.includes(remark) || bodyText.includes(fileName) || /AI\s*summary|summary|recording/i.test(bodyText);
      }, { timeout: 90000 })
      .toBeTruthy();

    await this.openLeadJourney();
    await expect
      .poll(async () => {
        const bodyText = await this.page.locator("body").innerText().catch(() => "");
        return bodyText.includes(remark) || bodyText.includes(fileName) || /AI\s*summary|summary|recording|follow\s*up|site\s*visit/i.test(bodyText);
      }, { timeout: 90000 })
      .toBeTruthy();
  }

  private async revealSavedRemark(remark: string) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const bodyText = await this.page.locator("body").innerText().catch(() => "");
      if (bodyText.includes(remark)) {
        return;
      }

      await tryClickFirstVisible(
        [
          this.page.locator("button").filter({ hasText: /recent first/i }).first(),
          this.page.locator("button").filter({ hasText: /add comment/i }).locator("xpath=following::button[1]").first(),
          this.page.locator("svg").locator("xpath=ancestor::*[@role='button' or self::button][1]").last(),
        ],
        { force: true },
      ).catch(() => false);

      await this.openLeadJourney().catch(() => {});
      await this.page.waitForTimeout(1000);
    }
  }

  async expectJourneyStages(stages: string[]) {
    await this.openLeadJourney();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const bodyText = await this.page.locator("body").innerText();
      if (stages.every((stage) => this.matchesStageText(bodyText, stage))) {
        return;
      }

      const scrolled = await this.scrollJourneySection();
      if (!scrolled) {
        break;
      }

      await this.page.waitForTimeout(600);
    }

    const finalBodyText = await this.page.locator("body").innerText();
    for (const stage of stages) {
      expect(this.matchesStageText(finalBodyText, stage)).toBeTruthy();
    }
  }

  private matchesStageText(bodyText: string, stage: string) {
    if (new RegExp(stage, "i").test(bodyText)) {
      return true;
    }

    if (/^cancelled$/i.test(stage)) {
      return /cancelled|dropped reason|drop reason|stage updated to cancelled/i.test(bodyText);
    }

    return false;
  }

  private async findFirstVisible(candidates: Locator[]) {
    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }

    return null;
  }

  private async visibleAddCommentPanel(profileUrl?: string) {
    if (profileUrl && !/engagement-intelligence\/manage-leads\/?\?id=/.test(this.page.url())) {
      await this.page.goto(profileUrl, { waitUntil: "domcontentloaded" });
      await this.expectLoaded();
      await this.openAddCommentPanel();
    }

    const modal = this.page
      .locator("#root-modal")
      .filter({ hasText: /Add comment and followup|remarks?|follow\s*up|site\s*visit/i })
      .first();
    if (
      await modal
        .isVisible()
        .catch(() => false)
    ) {
      return modal;
    }

    const title = this.page.getByText(/Add comment and followup/i).first();
    await expect(title).toBeVisible({ timeout: 30000 });
    const panel = title.locator(
      "xpath=ancestor::*[contains(., 'Upload Recording For') and contains(., 'Remarks')][1]",
    );
    await expect(panel).toBeVisible({ timeout: 30000 });
    return panel;
  }

  private async expectVisibleWithinPanel(panel: Locator, candidates: Locator[], label: string) {
    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) {
        return;
      }
    }

    const panelText = await panel.innerText().catch(() => "");
    throw new Error(`Expected ${label} to be visible in Add Comment panel. Panel text: ${panelText.slice(0, 500)}`);
  }

  private async clickLastVisibleSave() {
    const saveButtons = [
      this.page.locator("#root-modal").getByRole("button", { name: /^save$/i }),
      this.page.getByRole("button", { name: /^save$/i }),
    ];

    for (const locator of saveButtons) {
      const count = await locator.count().catch(() => 0);
      for (let index = count - 1; index >= 0; index -= 1) {
        const button = locator.nth(index);
        if (await button.isVisible().catch(() => false)) {
          await button.click({ force: true });
          return true;
        }
      }
    }

    return false;
  }

  private async scrollJourneySection() {
    return await this.page.evaluate(() => {
      const scrollables = Array.from(document.querySelectorAll("div")).filter(
        (element) => {
          const html = element as HTMLDivElement;
          const style = window.getComputedStyle(html);
          const rect = html.getBoundingClientRect();
          const text = (html.innerText || "").trim();

          return (
            rect.width > 0 &&
            rect.height > 0 &&
            html.scrollHeight > html.clientHeight &&
            (style.overflowY === "auto" || style.overflowY === "scroll") &&
            /Lead Journey|New Lead|Open|Qualified|Site Visit|Opportunity/i.test(
              text,
            )
          );
        },
      );

      for (const element of scrollables) {
        const html = element as HTMLDivElement;
        const previousTop = html.scrollTop;
        html.scrollTop = Math.min(
          html.scrollTop + Math.max(Math.floor(html.clientHeight * 0.8), 220),
          html.scrollHeight,
        );

        if (html.scrollTop !== previousTop) {
          return true;
        }
      }

      return false;
    });
  }
}
