import { expect, type Locator, type Page } from "@playwright/test";
import { ensureAuthenticatedSession } from "../support/session";
import { clickWithFallback, fillWithFallback, tryClickFirstVisible } from "../support/ui-actions";

export type MartechTemplateAppConfig = {
  baseUrl?: string;
  martechBaseUrl?: string;
  mobileNumber?: string;
  otp?: string;
};

export class MartechWhatsAppTemplatePage {
  constructor(private readonly page: Page) {}

  async openWhatsAppTemplates(app: MartechTemplateAppConfig) {
    const baseUrl = app.martechBaseUrl || app.baseUrl;
    const martechApp = { ...app, baseUrl };
    const manageConstructionUrl = new URL("/admin/developer/cpms/manage-construction", baseUrl).toString();

    await this.page.goto(manageConstructionUrl, { waitUntil: "domcontentloaded" });
    await ensureAuthenticatedSession(this.page, martechApp, manageConstructionUrl);

    const settingsButton = this.page.getByRole("button", { name: /settings/i }).first();
    await expect(settingsButton).toBeVisible({ timeout: 60000 });
    await clickWithFallback(
      settingsButton,
      this.page,
      async () => await this.page.getByRole("link", { name: /template\s+Whatsapp/i }).isVisible().catch(() => false),
      { force: true },
    );

    const templateLink = this.page.getByRole("link", { name: /template\s+Whatsapp/i }).first();
    await expect(templateLink).toBeVisible({ timeout: 60000 });
    await templateLink.click({ force: true });

    await expect(this.page.getByRole("button", { name: /Create New/i })).toBeVisible({ timeout: 60000 });
  }

  async createApprovedWhatsAppTemplate(templateName: string) {
    await this.page.getByRole("button", { name: /Create New/i }).click({ force: true });

    const templateNameInput = this.page.getByRole("textbox", { name: /Please Enter a template name/i }).first();
    await expect(templateNameInput).toBeVisible({ timeout: 30000 });
    await fillWithFallback(templateNameInput, templateName);

    await this.selectDropdownOption(/Select Service Provider/i, /^KARIX$/i);
    await this.selectFirstMatchingDropdownOption(/Select Sender Profile/i, /Yukio|8655|\(91/i);

    await tryClickFirstVisible([
      this.page.getByText(/Send promo offers, product/i).first(),
      this.page.getByText(/promo offers/i).first(),
    ], { force: true });

    await this.selectDropdownOption(/Search and Select Language/i, /^English$/i);
    await this.selectDropdownOption(/Select Header/i, /^Text$/i);

    await fillWithFallback(this.page.getByRole("textbox", { name: /Type your header here/i }).first(), "Test Header");
    await fillWithFallback(this.page.locator("#body").first(), "Test Body");
    await fillWithFallback(this.page.locator("#body").nth(1), "Thank You");

    for (const buttonName of [/Website/i, /Call/i, /Quick Reply/i, /Cancel/i]) {
      await expect(this.page.getByRole("button", { name: buttonName }).first()).toBeVisible({ timeout: 30000 });
    }

    await this.page.getByRole("button", { name: /icon Save|Save/i }).last().click({ force: true });
    await this.searchTemplate(templateName);

    const templateRow = this.templateRow(templateName);
    await expect(templateRow).toBeVisible({ timeout: 60000 });
    await expect(templateRow).toContainText(/Approved/i, { timeout: 60000 });
  }

  async deleteTemplate(templateName: string) {
    await this.searchTemplate(templateName);

    const row = this.templateRow(templateName);
    await expect(row).toBeVisible({ timeout: 60000 });

    await tryClickFirstVisible([
      row.getByRole("img", { name: /view|delete|trash/i }).first(),
      row.locator('img[alt*="view" i], img[alt*="delete" i], img[alt*="trash" i]').first(),
      row.locator("button").last(),
    ], { force: true });

    await expect(this.page.getByText(/^Delete Template$/i).first()).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByText(/This action cannot be undone/i)).toBeVisible();
    await expect(this.page.getByRole("button", { name: /^Cancel$/i })).toBeVisible();

    await this.page
      .getByRole("button", { name: /Delete Template/i })
      .last()
      .click({ force: true });

    await expect(this.page.getByText(/^Delete Template$/i).first()).toBeHidden({ timeout: 30000 });
    await this.searchTemplate(templateName);
    await expect(this.templateRow(templateName)).toBeHidden({ timeout: 30000 });
  }

  private async searchTemplate(templateName: string) {
    const searchInput = this.page.getByRole("textbox", { name: /Search/i }).first();
    await expect(searchInput).toBeVisible({ timeout: 60000 });
    await fillWithFallback(searchInput, templateName);
    await this.page.waitForTimeout(1000);
  }

  private templateRow(templateName: string) {
    return this.page.locator("tbody tr").filter({ hasText: new RegExp(this.escapeRegex(templateName), "i") }).first();
  }

  private async selectDropdownOption(triggerName: RegExp, optionName: RegExp) {
    const trigger = this.page.getByRole("button", { name: triggerName }).first();
    await expect(trigger).toBeVisible({ timeout: 30000 });
    await trigger.click({ force: true });

    const option = this.page.locator("button, [role='button']").filter({ hasText: optionName }).last();
    await expect(option).toBeVisible({ timeout: 30000 });
    await option.click({ force: true });
    await this.closeDropdown();
  }

  private async selectFirstMatchingDropdownOption(triggerName: RegExp, optionPattern: RegExp) {
    const trigger = this.page.getByRole("button", { name: triggerName }).first();
    await expect(trigger).toBeVisible({ timeout: 30000 });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await trigger.click({ force: true }).catch(() => {});
      const option = this.dropdownOption(optionPattern);
      if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
        await option.click({ force: true });
        await this.closeDropdown();
        return;
      }
      await this.closeDropdown();
      await this.page.waitForTimeout(500);
    }

    const firstAvailableOption = this.dropdownOption(/.+/);
    await expect(firstAvailableOption).toBeVisible({ timeout: 30000 });
    await firstAvailableOption.click({ force: true });
    await this.closeDropdown();
  }

  private dropdownOption(optionPattern: RegExp): Locator {
    return this.page
      .locator("button, [role='button']")
      .filter({ hasText: optionPattern })
      .filter({ hasNotText: /Select Sender Profile|Select Service Provider|Select Header|Search and Select Language/i })
      .last();
  }

  private async closeDropdown() {
    await this.page.keyboard.press("Escape").catch(() => {});
    await this.page.waitForTimeout(500);
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
