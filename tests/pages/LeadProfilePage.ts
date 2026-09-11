import { expect, type Locator, type Page } from "@playwright/test";
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
    const opened = await tryClickFirstVisible([
      this.page.getByRole("button", { name: /add remark/i }),
      this.page.getByRole("button", { name: /add comment/i }),
      this.page.getByText("Add Remark", { exact: true }),
      this.page.getByText("Add comment", { exact: true }),
    ]);

    if (!opened) {
      throw new Error("Add Remark action was not visible on the lead profile.");
    }

    const remarkInput = await this.findFirstVisible([
      this.page.getByRole("textbox", { name: /remark/i }).first(),
      this.page.locator("textarea").first(),
      this.page.locator('textarea[name*="remark" i]').first(),
    ]);

    if (!remarkInput) {
      throw new Error("Remark input was not visible after opening the Add Remark flow.");
    }

    await remarkInput.scrollIntoViewIfNeeded().catch(() => {});
    await remarkInput.fill(finalRemark);

    const saved = await this.clickLastVisibleSave();
    if (!saved) {
      throw new Error("Save button was not visible in the Add Remark flow.");
    }

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
    ]);

    if (!opened) {
      throw new Error("Add comment action was not visible on the lead profile.");
    }

    const panelTitle = this.page.getByText(/Add comment and followup/i).first();
    await expect(panelTitle).toBeVisible({ timeout: 60000 });

    return { panelTitle: await panelTitle.innerText() };
  }

  async addReEnquiry(source = "Direct Site Visit", subSource = "Walk In") {
    const opened = await tryClickFirstVisible([
      this.page.getByRole("button", { name: /^re-enquiry/i }),
      this.page.getByText(/^Re-Enquiry/i).first(),
      this.page.getByRole("button", { name: /add re-enquiry/i }),
      this.page.getByText("Add Re-Enquiry", { exact: true }),
      this.page.locator('button:has-text("Add Re-Enquiry")'),
    ]);

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
