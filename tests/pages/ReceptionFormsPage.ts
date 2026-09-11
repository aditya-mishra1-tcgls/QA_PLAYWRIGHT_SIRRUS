import { expect, type Locator, type Page } from "@playwright/test";
import { type LeadListAppConfig } from "./LeadListPage";
import { LoginPage } from "./LoginPage";
import {
  escapeRegex,
  fillWithFallback,
  tryClickFirstVisible,
} from "../support/ui-actions";

type ReceptionEnquirySeed = {
  companyName: string;
  customerName: string;
  designation: string;
  phone: string;
  otp: string;
  email: string;
  comments: string;
};

type ReceptionFormsUser = {
  mobileNumber: string;
  otp: string;
};

export class ReceptionFormsPage {
  constructor(private readonly page: Page) {}

  get receptionistFormsModuleButton() {
    return this.page
      .getByRole("button", { name: /receptionist forms/i })
      .first();
  }

  get phoneInput() {
    return this.page.locator("#phone").first();
  }

  async open(app: LeadListAppConfig) {
    await this.loginFreshForReceptionForms(app);
    await expect(this.receptionistFormsModuleButton).toBeVisible({ timeout: 60000 });
    await expect
      .poll(async () => {
        if (await this.page.getByText("Reception Form").first().isVisible().catch(() => false)) {
          return true;
        }

        await this.receptionistFormsModuleButton.click({ force: true }).catch(async () => {
          await this.receptionistFormsModuleButton.evaluate((element) => (element as HTMLElement).click()).catch(() => {});
        });
        await this.page.waitForTimeout(1000);
        return await this.page.getByText("Reception Form").first().isVisible().catch(() => false);
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  async loginFreshAs(app: Pick<LeadListAppConfig, "baseUrl">, user: ReceptionFormsUser) {
    if (!app.baseUrl || !user.mobileNumber || !user.otp) {
      throw new Error("Reception Forms login credentials were not available.");
    }

    await this.page.context().clearCookies();
    await this.page.goto(app.baseUrl, { waitUntil: "domcontentloaded" });
    await this.page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    }).catch(() => {});

    await new LoginPage(this.page).login({
      baseUrl: app.baseUrl,
      mobileNumber: user.mobileNumber,
      otp: user.otp,
    });
  }

  async expectReceptionFormsModuleRestricted() {
    await expect(this.page).toHaveURL(/\/admin\/(?!login)/, { timeout: 60000 });
    await expect(this.receptionistFormsModuleButton).toBeHidden({ timeout: 30000 });
    await expect(this.page.getByText("Reception Form").first()).toBeHidden();
  }

  private async loginFreshForReceptionForms(app: LeadListAppConfig) {
    await this.loginFreshAs(app, {
      mobileNumber: app.mobileNumber || "",
      otp: app.otp || "",
    });

    await expect
      .poll(async () => {
        return (
          !/\/admin\/login/i.test(this.page.url()) &&
          await this.receptionistFormsModuleButton.isVisible().catch(() => false)
        );
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  async expectReceptionFormLoaded() {
    await expect(this.page.getByText("Reception Form")).toBeVisible({ timeout: 60000 });
    await expect(this.page.getByRole("button", { name: "Enquiry Details" })).toBeVisible({
      timeout: 30000,
    });
    await expect(this.page.getByRole("button", { name: "Channel Partner", exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(this.page.getByRole("button", { name: "Search CRM Leads" })).toBeVisible({
      timeout: 30000,
    });
  }

  async submitEnquiryDetails(seed = this.buildEnquirySeed()) {
    await this.fillEnquiryDetails(seed);
    await expect(this.page.getByRole("button", { name: "Submit" })).toBeEnabled({ timeout: 30000 });
    await this.page.getByRole("button", { name: "Submit" }).click({ force: true });

    return seed;
  }

  async fillEnquiryDetails(seed = this.buildEnquirySeed()) {
    await this.expectReceptionFormLoaded();

    await this.fillFormField("natureOfWork", /Nature of work|Company Name/i, seed.companyName);
    await this.fillFormField("customerName", /Customer Name/i, seed.customerName);
    await this.fillFormField("designation", /Designation/i, seed.designation);
    await this.fillReceptionPhoneNumber(seed.phone);
    await this.triggerReceptionMobileOtp();
    await this.fillFormField("otp", /Enter OTP/i, seed.otp);
    await this.verifyReceptionOtp();
    await this.selectOptionForField(/Budget Range/i, /1\.60\s*Cr/i);
    await this.fillFormField("email", /Email/i, seed.email);
    await this.selectOptionForField(/^State/i, "KARNATAKA");
    await this.selectOptionForField(/^City/i, "Adyar");
    await this.selectOptionForField(/Interested in/i, /BHK/i);
    await this.selectOptionForField(/^Region/i, "Adyar");
    await this.page.getByRole("button", { name: "Male", exact: true }).click({ force: true });
    await this.selectOptionForField(/^Source/i, "Walk-in");
    await this.selectOptionForField(/Sub-Source/i, /Acres/i);
    await this.selectOptionForField(/Assigned to/i, "Abhijit Bhalerao");
    await this.fillFormField("comments", /Comments/i, seed.comments);
    await this.selectOptionForField(/^Status/i, /Warm/i);
    await this.acceptTerms();
    await this.drawSignature();

    return seed;
  }

  async resetFormAndExpectFieldsReset() {
    await this.page.getByRole("button", { name: "Reset" }).click({ force: true });
    await this.expectNonDateFieldsReset();
  }

  async refreshFormAndExpectDataRetained(seed: ReceptionEnquirySeed) {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await this.expectReceptionFormLoaded();

    await expect(this.page.locator("#natureOfWork")).toHaveValue(seed.companyName, { timeout: 30000 });
    await expect(this.page.locator("#customerName")).toHaveValue(seed.customerName);
    await expect(this.page.locator("#designation")).toHaveValue(seed.designation);
    await expect(this.phoneInput).toHaveValue("");
    await expect(this.page.locator("#otp")).toHaveValue("");
    await expect(this.page.locator("#email")).toHaveValue(seed.email);
    await expect(this.page.locator("#comments")).toHaveValue(seed.comments);

    await this.expectDropdownValue(/Budget Range/i, /1\.60\s*Cr/i);
    await this.expectDropdownValue(/^State/i, /KARNATAKA/i);
    await this.expectDropdownValue(/^City/i, /Adyar/i);
    await this.expectDropdownValue(/Interested in/i, /BHK/i);
    await this.expectDropdownValue(/^Region/i, /Adyar/i);
    await this.expectDropdownValue(/^Source/i, /Walk-in/i);
    await this.expectDropdownValue(/Sub-Source/i, /Acres/i);
    await this.expectDropdownValue(/Assigned to/i, /Abhijit Bhalerao/i);
    await this.expectDropdownValue(/^Status/i, /Warm/i);
  }

  async submitDuplicateLeadAndExpectError() {
    const seed = await this.submitEnquiryDetails();
    await this.expectEnquirySubmittedSuccessfully();
    await this.startFreshEnquiryForm();
    await this.fillDuplicateEnquiryAttempt(seed);
    await this.expectDuplicateLeadErrorMessage();

    return seed;
  }

  async expectEnquirySubmittedSuccessfully() {
    await expect(this.page.getByText("Enquiry Details added")).toBeVisible({
      timeout: 60000,
    });
    await expect(this.page.locator("body")).toContainText("Enquiry Details added successfully!");
  }

  private buildEnquirySeed(): ReceptionEnquirySeed {
    const suffix = String(Date.now()).slice(-6);
    const phoneSuffix = String(Math.floor(100000000 + Math.random() * 900000000));

    return {
      companyName: `Test AT ${suffix}`,
      customerName: `Test AT Name ${suffix}`,
      designation: "IT Service",
      phone: `8${phoneSuffix}`,
      otp: "1234",
      email: `reception.at.${suffix}@example.com`,
      comments: "test",
    };
  }

  private async startFreshEnquiryForm() {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await this.expectReceptionFormLoaded();
    await this.page.getByRole("button", { name: "Reset" }).click({ force: true }).catch(() => {});
    await this.expectNonDateFieldsReset();
  }

  private async fillDuplicateEnquiryAttempt(seed: ReceptionEnquirySeed) {
    await this.expectReceptionFormLoaded();
    await this.fillFormField("natureOfWork", /Nature of work|Company Name/i, seed.companyName);
    await this.fillFormField("customerName", /Customer Name/i, seed.customerName);
    await this.fillFormField("designation", /Designation/i, seed.designation);
    await this.fillReceptionPhoneNumber(seed.phone);

    await this.page.getByText("Personal Details").click({ force: true }).catch(() => {});
    if (await this.waitForDuplicateLeadValidationError()) {
      return;
    }

    await this.triggerReceptionMobileOtp();
    await this.fillFormField("otp", /Enter OTP/i, seed.otp);
    await this.verifyReceptionOtp();
    await this.selectOptionForField(/Budget Range/i, /1\.60\s*Cr/i);
    await this.fillFormField("email", /Email/i, seed.email);
    await this.selectOptionForField(/^State/i, "KARNATAKA");
    await this.selectOptionForField(/^City/i, "Adyar");
    await this.selectOptionForField(/Interested in/i, /BHK/i);
    await this.selectOptionForField(/^Region/i, "Adyar");
    await this.page.getByRole("button", { name: "Male", exact: true }).click({ force: true });
    await this.selectOptionForField(/^Source/i, "Walk-in");
    await this.selectOptionForField(/Sub-Source/i, /Acres/i);
    await this.selectOptionForField(/Assigned to/i, "Abhijit Bhalerao");
    await this.fillFormField("comments", /Comments/i, seed.comments);
    await this.selectOptionForField(/^Status/i, /Warm/i);
    await this.acceptTerms();
    await this.drawSignature();
    await expect(this.page.getByRole("button", { name: "Submit" })).toBeEnabled({ timeout: 30000 });
    await this.page.getByRole("button", { name: "Submit" }).click({ force: true });
  }

  private get duplicateLeadErrorMessage() {
    return this.page
      .getByText(/already\s*(registered|exists)|duplicate|lead.*already|mobile.*already|phone.*already|customer.*already/i)
      .first();
  }

  private async hasDuplicateLeadValidationError() {
    if (await this.duplicateLeadErrorMessage.isVisible({ timeout: 1000 }).catch(() => false)) {
      return true;
    }

    return await this.page
      .evaluate(() => {
        const phoneInput = document.querySelector<HTMLInputElement>("#phone");
        if (!phoneInput) {
          return false;
        }

        const duplicatePattern = /already\s*(registered|exists)|duplicate|lead.*already|mobile.*already|phone.*already|customer.*already/i;
        let container: HTMLElement | null = phoneInput;
        for (let depth = 0; depth < 5 && container; depth += 1) {
          const text = (container.textContent || "").replace(/\s+/g, " ").trim();
          if (duplicatePattern.test(text)) {
            return true;
          }

          const className = typeof container.className === "string" ? container.className : "";
          const style = window.getComputedStyle(container);
          const hasErrorClass = /border-red|text-red|error|invalid/i.test(className);
          const hasErrorBorder =
            /rgb\(\s*255\s*,\s*(0|[1-9]\d?)\s*,\s*(0|[1-9]\d?)\s*\)/i.test(style.borderColor) ||
            /rgb\(\s*255\s*,\s*(0|[1-9]\d?)\s*,\s*(0|[1-9]\d?)\s*\)/i.test(style.outlineColor);
          const hasErrorIcon = Boolean(container.querySelector("img, svg"));
          const isPhoneFieldContainer = /\(\+91\)/.test(text) && phoneInput.value.trim().length === 10;
          if (hasErrorClass || hasErrorBorder || (isPhoneFieldContainer && hasErrorIcon)) {
            return true;
          }

          container = container.parentElement;
        }

        return false;
      })
      .catch(() => false);
  }

  private async expectDuplicateLeadErrorMessage() {
    await expect
      .poll(async () => await this.hasDuplicateLeadValidationError(), { timeout: 30000 })
      .toBeTruthy();
  }

  private async waitForDuplicateLeadValidationError() {
    return await expect
      .poll(async () => await this.hasDuplicateLeadValidationError(), { timeout: 7000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
  }

  private async selectOptionFromDropdown(
    selectHereIndex: number,
    optionName: string | RegExp,
    optionIndex = 0,
  ) {
    const dropdown = this.page.getByRole("button", { name: "Select here" }).nth(selectHereIndex);
    await expect(dropdown).toBeVisible({ timeout: 30000 });

    const optionPattern =
      typeof optionName === "string"
        ? new RegExp(`^${escapeRegex(optionName)}$`, "i")
        : optionName;
    const optionCandidates = [
      this.page.getByRole("button", { name: optionPattern }).nth(optionIndex),
      this.page.locator("button").filter({ hasText: optionPattern }).nth(optionIndex),
      this.page.getByText(optionPattern).nth(optionIndex),
    ];

    const selected = await expect
      .poll(async () => {
        await dropdown.click({ force: true }).catch(() => {});
        return await tryClickFirstVisible(optionCandidates, { force: true, timeout: 2000 });
      }, {
        timeout: 30000,
      })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
    if (!selected) {
      throw new Error(`Unable to select reception form option "${optionName.toString()}".`);
    }
  }

  private async selectOptionForField(
    fieldLabel: RegExp,
    optionName: string | RegExp,
    optionIndex = 0,
  ) {
    const dropdown = this.dropdownForField(fieldLabel);
    await this.selectOptionFromOpenedDropdown(dropdown, optionName, optionIndex);
    await expect
      .poll(async () => {
        const fieldText = await dropdown.textContent().catch(() => "");
        if (this.matchesOptionText(fieldText || "", optionName)) {
          return true;
        }

        await this.selectOptionFromOpenedDropdown(dropdown, optionName, optionIndex);
        const updatedText = await dropdown.textContent().catch(() => "");
        return this.matchesOptionText(updatedText || "", optionName);
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  private dropdownForField(fieldLabel: RegExp) {
    return this.page
      .getByText(fieldLabel)
      .locator("xpath=(ancestor::div[1]//button[not(@disabled)] | following::button[not(@disabled)][1])")
      .first();
  }

  private async selectOptionFromOpenedDropdown(
    dropdown: Locator,
    optionName: string | RegExp,
    optionIndex = 0,
  ) {
    await expect(dropdown).toBeVisible({ timeout: 30000 });
    await dropdown.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    }).catch(() => {});
    await this.page.waitForTimeout(300);

    const optionPattern =
      typeof optionName === "string"
        ? new RegExp(`^${escapeRegex(optionName)}$`, "i")
        : optionName;
    const searchableText =
      typeof optionName === "string"
        ? optionName
        : optionName.source.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/)[0] || "";
    const optionCandidates = [
      this.page.getByRole("button", { name: optionPattern }).nth(optionIndex),
      this.page.locator("button").filter({ hasText: optionPattern }).nth(optionIndex),
      this.page.getByText(optionPattern).nth(optionIndex),
    ];

    const selected = await expect
      .poll(async () => {
        await dropdown.click({ force: true }).catch(() => {});
        if (searchableText) {
          const searchBox = this.page.getByRole("textbox", { name: /search/i }).first();
          if (await searchBox.isVisible().catch(() => false)) {
            await searchBox.fill(searchableText).catch(() => {});
          }
        }
        if (await this.clickOptionBelowDropdown(dropdown, optionName, optionIndex)) {
          return true;
        }
        return await tryClickFirstVisible(optionCandidates, { force: true, timeout: 2000 });
      }, {
        timeout: 30000,
      })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
    if (!selected) {
      throw new Error(`Unable to select reception form option "${optionName.toString()}".`);
    }
  }

  private matchesOptionText(value: string, optionName: string | RegExp) {
    const normalizedValue = value.replace(/\s+/g, " ").trim();
    return typeof optionName === "string"
      ? new RegExp(escapeRegex(optionName), "i").test(normalizedValue)
      : optionName.test(normalizedValue);
  }

  private async clickOptionBelowDropdown(
    dropdown: Locator,
    optionName: string | RegExp,
    optionIndex: number,
  ) {
    const dropdownBox = await dropdown.boundingBox().catch(() => null);
    if (!dropdownBox) {
      return false;
    }

    return await this.page
      .evaluate(({ optionSource, optionFlags, minY, optionIndex }) => {
        const optionPattern = new RegExp(optionSource, optionFlags);
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
          );
        };
        const matchingButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter((button) => {
          const rect = button.getBoundingClientRect();
          const text = (button.textContent || "").replace(/\s+/g, " ").trim();
          return isVisible(button) && rect.top >= minY - 4 && optionPattern.test(text);
        });
        const target = matchingButtons[optionIndex];
        if (!target) {
          return false;
        }

        target.scrollIntoView({ block: "center", inline: "nearest" });
        target.click();
        return true;
      }, {
        optionSource: typeof optionName === "string" ? `^${escapeRegex(optionName)}$` : optionName.source,
        optionFlags: typeof optionName === "string" ? "i" : optionName.flags,
        minY: dropdownBox.y + dropdownBox.height,
        optionIndex,
      })
      .catch(() => false);
  }

  private async fillFormField(
    fieldId: string,
    labelPattern: RegExp,
    value: string,
  ) {
    const candidates = [
      this.page.locator(`#${fieldId}`).first(),
      this.page
        .getByText(labelPattern)
        .locator("xpath=ancestor::*[contains(@class, 'flex') or self::div][1]//input")
        .first(),
      this.page
        .getByText(labelPattern)
        .locator("xpath=ancestor::*[contains(@class, 'flex') or self::div][1]//textarea")
        .first(),
      this.page
        .getByText(labelPattern)
        .locator("xpath=following::input[1]")
        .first(),
      this.page
        .getByText(labelPattern)
        .locator("xpath=following::textarea[1]")
        .first(),
    ];

    for (const candidate of candidates) {
      if (!(await candidate.isVisible().catch(() => false))) {
        continue;
      }

      const filled = await fillWithFallback(candidate, value);
      const applied = await candidate
        .inputValue()
        .then((currentValue) => currentValue === value)
        .catch(() => false);
      if (filled && applied) {
        return;
      }
    }

    if (await this.setFieldValueWithNativeEvents(fieldId, labelPattern, value)) {
      return;
    }

    throw new Error(`Unable to fill reception form field "${fieldId}".`);
  }

  private async fillReceptionPhoneNumber(phone: string) {
    const phoneInput = await this.visibleReceptionPhoneInput();

    await expect(phoneInput).toBeVisible({ timeout: 30000 });
    await phoneInput.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    }).catch(() => {});
    await phoneInput.click({ force: true });
    await phoneInput.fill("").catch(() => {});
    await phoneInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
    await phoneInput.pressSequentially(phone, { delay: 30 }).catch(() => {});

    let applied = await phoneInput
      .inputValue()
      .then((currentValue) => currentValue === phone)
      .catch(() => false);
    if (!applied) {
      applied = await fillWithFallback(phoneInput, phone);
    }
    if (!applied) {
      throw new Error("Unable to enter mobile number in reception form phone field.");
    }

    await expect
      .poll(async () => await phoneInput.inputValue().catch(() => ""), { timeout: 10000 })
      .toBe(phone);
  }

  private async visibleReceptionPhoneInput() {
    const candidates = [
      this.phoneInput,
      this.page
        .getByText(/Phone\/WhatsApp Number/i)
        .locator("xpath=following::input[1]")
        .first(),
    ];

    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }

    throw new Error("Reception form phone field was not visible.");
  }

  private async expectNonDateFieldsReset() {
    await expect(this.page.locator("#natureOfWork")).toHaveValue("", { timeout: 30000 });
    await expect(this.page.locator("#customerName")).toHaveValue("");
    await expect(this.page.locator("#designation")).toHaveValue("");
    await expect(this.phoneInput).toHaveValue("");
    await expect(this.page.locator("#otp")).toHaveValue("");
    await expect(this.page.locator("#email")).toHaveValue("");
    await expect(this.page.locator("#comments")).toHaveValue("");

    await this.expectDropdownReset(/Budget Range/i);
    await this.expectDropdownReset(/^State/i);
    await this.expectDropdownReset(/^City/i);
    await this.expectDropdownReset(/Interested in/i);
    await this.expectDropdownReset(/^Region/i);
    await this.expectDropdownReset(/^Source/i);
    await this.expectDropdownReset(/Sub-Source/i);
    await this.expectDropdownReset(/Assigned to/i);
    await this.expectDropdownReset(/^Status/i);
    await expect(this.page.getByRole("button", { name: "Submit" })).toBeDisabled();
  }

  private async expectDropdownReset(fieldLabel: RegExp) {
    await expect(this.dropdownForField(fieldLabel)).toContainText(/Select here/i);
  }

  private async expectDropdownValue(fieldLabel: RegExp, valuePattern: RegExp) {
    await expect(this.dropdownForField(fieldLabel)).toContainText(valuePattern);
  }

  private async triggerReceptionMobileOtp() {
    await this.page.getByText("Personal Details").click({ force: true }).catch(async () => {
      await this.page.locator("body").click({ position: { x: 20, y: 20 } });
    });

    await expect(
      this.page.getByText(/OTP\s*Sent|Resend in/i).first(),
    ).toBeVisible({ timeout: 30000 });
  }

  private async verifyReceptionOtp() {
    await this.page.getByText("Personal Details").click({ force: true }).catch(async () => {
      await this.page.locator("body").click({ position: { x: 20, y: 20 } });
    });

    await expect(
      this.page.getByText(/OTP\s*Verified|Verified/i).first(),
    ).toBeVisible({ timeout: 30000 });
  }

  private async setFieldValueWithNativeEvents(fieldId: string, labelPattern: RegExp, value: string) {
    return await this.page
      .evaluate(({ fieldId: targetFieldId, labelSource, labelFlags, value: nextValue }) => {
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const labelRegex = new RegExp(labelSource, labelFlags);
        const visibleFields = Array.from(
          document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"),
        ).filter(isVisible);
        const fieldById = visibleFields.find((field) => field.id === targetFieldId);
        const label = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,p,label,span")).find((element) => {
          return isVisible(element) && labelRegex.test((element.textContent || "").replace(/\s+/g, " ").trim());
        });
        const fieldByLabel = label
          ? visibleFields.find((field) => {
              const labelBox = label.getBoundingClientRect();
              const fieldBox = field.getBoundingClientRect();
              return fieldBox.top >= labelBox.top && fieldBox.top - labelBox.bottom < 120;
            })
          : undefined;
        const field = fieldById || fieldByLabel;
        if (!field || !("value" in field)) {
          return false;
        }

        field.scrollIntoView({ block: "center", inline: "nearest" });
        field.focus();
        const prototype = field instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        valueSetter?.call(field, nextValue);
        field.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          data: nextValue,
          inputType: "insertText",
        }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        field.dispatchEvent(new KeyboardEvent("keyup", {
          bubbles: true,
          key: nextValue[nextValue.length - 1] || "",
        }));
        return field.value === nextValue;
      }, {
        fieldId,
        labelSource: labelPattern.source,
        labelFlags: labelPattern.flags,
        value,
      })
      .catch(() => false);
  }

  private async acceptTerms() {
    const termsLabel = this.page.getByText(/I agree with the Terms/i).first();
    await termsLabel.scrollIntoViewIfNeeded().catch(() => {});

    const accepted = await expect
      .poll(async () => {
        const checkbox = this.page.getByRole("checkbox").first();
        if (await checkbox.isVisible().catch(() => false)) {
          await checkbox.check({ force: true }).catch(async () => await checkbox.click({ force: true }));
          return await checkbox.isChecked().catch(() => true);
        }

        const labelBox = await termsLabel.boundingBox().catch(() => null);
        if (!labelBox) {
          return false;
        }

        await this.page.mouse.click(labelBox.x - 18, labelBox.y + labelBox.height / 2);
        return true;
      }, { timeout: 10000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
    if (!accepted) {
      throw new Error("Unable to accept reception form terms before submit.");
    }
  }

  private async drawSignature() {
    const signatureLabel = this.page.getByText(/Draw your Signature/i).first();
    await signatureLabel.scrollIntoViewIfNeeded().catch(() => {});
    const labelBox = await signatureLabel.boundingBox().catch(() => null);
    if (!labelBox) {
      return;
    }

    const startX = labelBox.x + 80;
    const startY = labelBox.y + labelBox.height + 55;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + 80, startY + 25, { steps: 8 });
    await this.page.mouse.move(startX + 150, startY - 5, { steps: 8 });
    await this.page.mouse.up();
  }
}
