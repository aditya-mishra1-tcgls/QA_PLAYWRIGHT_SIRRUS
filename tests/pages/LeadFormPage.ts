import { expect, type Page } from "@playwright/test";
import { waitForHiddenWithFallback } from "../support/ui-actions";

export class LeadFormPage {
  constructor(private readonly page: Page) {}

  get modal() {
    return this.page.locator("#root-modal");
  }

  get title() {
    return this.page.getByText("Lead Form", { exact: true });
  }

  get fullNameInput() {
    return this.page.locator("#fullName");
  }

  get whatsappInput() {
    return this.page.locator("#whatsAppNumber");
  }

  get sourceCategoryInput() {
    return this.page.locator("#sourceCategory");
  }

  get saveButton() {
    return this.modal.getByRole("button", { name: /^save$/i });
  }

  async expectOpen() {
    await expect(this.title).toBeVisible({ timeout: 30000 });
  }

  async saveAndWaitForClose() {
    await expect(this.saveButton).toBeVisible({ timeout: 30000 });
    await this.saveButton.click();
    await waitForHiddenWithFallback(this.title, this.page, 60000);
  }
}
