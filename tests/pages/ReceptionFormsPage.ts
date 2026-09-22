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
  state: string;
  city: string;
  interestedIn: string;
  region: string;
  source: string;
  subSource: string;
  assignedTo: string;
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
    await this.openWithStoredReceptionSession(app);
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
    await this.ensureReceptionProjectSelected(app);
    await this.expectReceptionFormLoaded();
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

  private async openWithStoredReceptionSession(app: LeadListAppConfig) {
    await this.page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => {
        return (
          !/\/admin\/login/i.test(this.page.url()) &&
          await this.receptionistFormsModuleButton.isVisible().catch(() => false)
        );
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  private async ensureReceptionProjectSelected(app: LeadListAppConfig) {
    const projectName = app.receptionFormsProjectName;
    if (!projectName) {
      return;
    }

    await this.selectReceptionProject(projectName);
  }

  private async selectReceptionProject(projectName: string) {
    await this.page.keyboard.press("Escape").catch(() => {});
    const selectedProjectButton = this.page.getByRole("button", {
      name: new RegExp(escapeRegex(projectName), "i"),
    }).last();
    const selectedProjectText = this.page.getByText(new RegExp(`^${escapeRegex(projectName)}$`, "i")).last();
    if (
      await selectedProjectButton.isVisible().catch(() => false) ||
      await selectedProjectText.isVisible().catch(() => false) ||
      await this.hasVisibleProjectText(projectName)
    ) {
      return;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const selected = await expect
        .poll(async () => {
          await this.page.keyboard.press("Escape").catch(() => {});
          await this.clickVisibleReceptionProjectDropdown();
          await this.page.waitForTimeout(500);
          const clicked = await this.page
            .getByRole("button", { name: new RegExp(`^${escapeRegex(projectName)}$`, "i") })
            .click({ force: true, timeout: 3000 })
            .then(() => true)
            .catch(async () => await this.clickProjectOptionByVisibleText(projectName));
          if (!clicked) {
            return false;
          }
          return (
            await this.hasVisibleProjectText(projectName) ||
            await this.page.getByRole("button", { name: new RegExp(escapeRegex(projectName), "i") }).last().isVisible().catch(() => false)
          );
        }, { timeout: 15000 })
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);
      if (selected) {
        return;
      }
    }

    throw new Error(`Unable to select reception project "${projectName}".`);
  }

  private async clickVisibleReceptionProjectDropdown() {
    const controlBox = await this.page
      .evaluate(() => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const projectPattern = /prime apartments|migration project|prasun adara/i;
        const projectElement = Array.from(document.querySelectorAll<HTMLElement>("button,[role='button'],p,span,div"))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const text = normalize(element.textContent);
            return (
              isVisible(element) &&
              projectPattern.test(text) &&
              rect.x > viewportWidth * 0.6 &&
              rect.y > 90 &&
              rect.y < 220
            );
          })
          .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length)[0];
        const fallbackBlankProjectControl = Array.from(document.querySelectorAll<HTMLElement>("button,[role='button'],[class*='cursor-pointer']"))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const text = normalize(element.textContent);
            return (
              isVisible(element) &&
              rect.x > viewportWidth * 0.68 &&
              rect.y > 100 &&
              rect.y < 210 &&
              rect.width > 180 &&
              rect.height > 34 &&
              rect.height < 70 &&
              !/search|sunil|dxp admin|go to my account|logout/i.test(text)
            );
          })
          .sort((left, right) => right.getBoundingClientRect().width - left.getBoundingClientRect().width)[0];
        const dropdownControl = projectElement || fallbackBlankProjectControl;
        if (!dropdownControl) {
          return null;
        }

        const clickable = dropdownControl.closest<HTMLElement>("button,[role='button'],[class*='cursor-pointer']") ?? dropdownControl;
        clickable.scrollIntoView({ block: "center", inline: "nearest" });
        const rect = clickable.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      })
      .catch(() => null);

    if (!controlBox) {
      throw new Error("Reception project dropdown was not visible.");
    }

    await this.page.mouse.click(controlBox.x + controlBox.width - 30, controlBox.y + controlBox.height / 2);
    await this.page.waitForTimeout(600);
  }

  private async clickProjectOptionByVisibleText(projectName: string) {
    return await this.page
      .evaluate((expectedProjectName) => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const option = Array.from(document.querySelectorAll<HTMLElement>("button,[role='button'],[class*='cursor-pointer'],p,span,div"))
          .filter((element) => normalize(element.textContent).toLowerCase() === expectedProjectName.toLowerCase() && isVisible(element))
          .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length)[0];
        if (!option) {
          return false;
        }

        const clickable = option.closest<HTMLElement>("button,[role='button'],[class*='cursor-pointer']") ?? option;
        clickable.scrollIntoView({ block: "center", inline: "nearest" });
        clickable.click();
        return true;
      }, projectName)
      .catch(() => false);
  }

  private async hasVisibleProjectText(projectName: string) {
    return await this.page
      .evaluate((expectedProjectName) => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };

        return Array.from(document.querySelectorAll<HTMLElement>("body *")).some((element) => (
          normalize(element.textContent).toLowerCase() === expectedProjectName.toLowerCase() &&
          isVisible(element)
        ));
      }, projectName)
      .catch(() => false);
  }

  private async openProjectDropdown(projectDropdown: Locator) {
    await projectDropdown.scrollIntoViewIfNeeded().catch(() => {});
    const box = await projectDropdown.boundingBox().catch(() => null);
    if (box) {
      await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await this.page.waitForTimeout(300);
      await this.page.mouse.click(box.x + box.width - 32, box.y + box.height / 2);
      await this.page.waitForTimeout(800);
      return;
    }

    await projectDropdown.click({ force: true });
    await this.page.waitForTimeout(800);
  }

  private async topBarProjectDropdown() {
    const candidates = await this.page.locator("button").filter({ hasText: /\S/ }).all();
    const viewport = this.page.viewportSize();
    const minimumX = viewport ? viewport.width * 0.65 : 700;
    const projectNamePattern = /prime apartments|migration project|prasun adara/i;

    for (const candidate of candidates) {
      const box = await candidate.boundingBox().catch(() => null);
      const text = ((await candidate.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
      if (
        box &&
        box.y >= 95 &&
        box.y < 210 &&
        box.x > minimumX &&
        projectNamePattern.test(text) &&
        await candidate.isVisible().catch(() => false)
      ) {
        return candidate;
      }
    }

    for (const candidate of candidates) {
      const box = await candidate.boundingBox().catch(() => null);
      const text = ((await candidate.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
      if (
        box &&
        box.y >= 95 &&
        box.y < 210 &&
        box.x > minimumX &&
        box.width > 160 &&
        !/search|profile|sunil|dxp admin|go to my account|logout/i.test(text) &&
        await candidate.isVisible().catch(() => false)
      ) {
        return candidate;
      }
    }

    return this.page.getByRole("button", {
      name: /prime apartments|migration project|prasun adara/i,
    }).last();
  }

  private async clickProjectOption(projectDropdown: Locator, projectName: string) {
    const dropdownBox = await projectDropdown.boundingBox().catch(() => null);
    const clicked = await this.page
      .evaluate(({ projectName, dropdownBottom }) => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const options = Array.from(document.querySelectorAll<HTMLElement>("button,[role='button'],[class*='cursor-pointer'],p,div,li"))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return normalize(element.textContent).toLowerCase() === projectName.toLowerCase()
              && isVisible(element)
              && (!dropdownBottom || rect.top >= dropdownBottom - 8);
          });

        const option = options[0];
        if (!option) {
          return false;
        }

        const clickable = option.closest<HTMLElement>("button,[role='button'],[class*='cursor-pointer'],li") ?? option;
        clickable.scrollIntoView({ block: "center", inline: "nearest" });
        clickable.click();
        return true;
      }, {
        projectName,
        dropdownBottom: dropdownBox ? dropdownBox.y + dropdownBox.height : 0,
      })
      .catch(() => false);

    if (clicked) {
      return;
    }

    const optionPattern = new RegExp(`^${escapeRegex(projectName)}$`, "i");
    const optionCandidates = [
      this.page
        .locator("p.font-normal.truncate.text-sm")
        .filter({ hasText: optionPattern })
        .locator("xpath=ancestor::button[1]")
        .first(),
      this.page
        .locator("p.font-normal.truncate.text-sm")
        .filter({ hasText: optionPattern })
        .locator("xpath=ancestor::*[contains(@class,'cursor-pointer')][1]")
        .first(),
      this.page.getByText(optionPattern).last(),
    ];

    await tryClickFirstVisible(optionCandidates, { force: true, timeout: 4000 });
  }

  async expectReceptionFormLoaded() {
    await expect(this.page.getByText("Reception Form")).toBeVisible({ timeout: 60000 });
    await expect(this.page.getByRole("button", { name: "Enquiry Details" })).toBeVisible({
      timeout: 30000,
    });
    await expect(this.page.getByRole("button", { name: "Channel Partner", exact: true }).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(this.page.getByRole("button", { name: "Search CRM Leads" })).toBeVisible({
      timeout: 30000,
    });
  }

  async submitEnquiryDetails(seed = this.buildEnquirySeed()) {
    await this.fillEnquiryDetails(seed);
    await this.expectSubmitEnabledWithDiagnostics();
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
    await this.fillReceptionOtp(seed.otp);
    await this.verifyReceptionOtp();
    await this.selectOptionForField(/Budget Range/i, /1\.60\s*Cr/i);
    await this.fillFormField("email", /Email/i, seed.email);
    seed.state = await this.selectFirstAvailableOptionForField(/^State/i);
    seed.city = await this.selectFirstAvailableOptionForField(/^City/i);
    seed.interestedIn = await this.selectInterestedInOptionOnce();
    seed.region = await this.selectFirstAvailableOptionForField(/^Region/i);
    await this.page.getByRole("button", { name: "Male", exact: true }).click({ force: true });
    seed.source = await this.selectFirstAvailableOptionForField(/^Source/i);
    seed.subSource = await this.selectFirstAvailableOptionForField(/Sub-Source/i);
    
    seed.assignedTo = await this.selectAssignedTo("Aadi Gala");
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
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.page.waitForTimeout(3000);
    await this.expectReceptionFormLoaded();

    await expect(this.page.locator("#natureOfWork")).toHaveValue(seed.companyName, { timeout: 30000 });
    await expect(this.page.locator("#customerName")).toHaveValue(seed.customerName);
    await expect(this.page.locator("#designation")).toHaveValue(seed.designation);
    await expect(this.phoneInput).toHaveValue("");
    await expect(this.page.locator("#otp")).toHaveValue("");
    await expect(this.page.locator("#email")).toHaveValue(seed.email);
    await expect(this.page.locator("#comments")).toHaveValue(seed.comments);

    await this.expectDropdownValue(/Budget Range/i, /1\.60\s*Cr/i);
    await this.expectDropdownValue(/^State/i, new RegExp(escapeRegex(seed.state), "i"));
    await this.expectDropdownValue(/^City/i, new RegExp(escapeRegex(seed.city), "i"));
    await this.expectDropdownValue(/Interested in/i, new RegExp(escapeRegex(seed.interestedIn), "i"));
    await this.expectDropdownValue(/^Region/i, new RegExp(escapeRegex(seed.region), "i"));
    await this.expectDropdownValue(/^Source/i, new RegExp(escapeRegex(seed.source), "i"));
    await this.expectDropdownValue(/Sub-Source/i, new RegExp(escapeRegex(seed.subSource), "i"));
    await this.expectDropdownValue(/Assigned to/i, new RegExp(escapeRegex(seed.assignedTo), "i"));
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
      state: "",
      city: "",
      interestedIn: "BHK",
      region: "Adyar",
      source: "Channel Partner",
      subSource: "Acres",
      assignedTo: "Abhijit Bhalerao",
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
    await this.fillReceptionOtp(seed.otp);
    await this.verifyReceptionOtp();
    await this.selectOptionForField(/Budget Range/i, /1\.60\s*Cr/i);
    await this.fillFormField("email", /Email/i, seed.email);
    seed.state = await this.selectFirstAvailableOptionForField(/^State/i);
    seed.city = await this.selectFirstAvailableOptionForField(/^City/i);
    seed.interestedIn = await this.selectInterestedInOptionOnce();
    seed.region = await this.selectFirstAvailableOptionForField(/^Region/i);
    await this.page.getByRole("button", { name: "Male", exact: true }).click({ force: true });
    seed.source = await this.selectFirstAvailableOptionForField(/^Source/i);
    seed.subSource = await this.selectFirstAvailableOptionForField(/Sub-Source/i);
    seed.assignedTo = await this.selectAssignedTo("Aadi Gala");
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
    await expect
      .poll(async () => {
        const selectedText = await this.selectDropdownOptionForField(fieldLabel, optionName, optionIndex, false);
        return this.matchesOptionText(selectedText, optionName);
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  private async selectPreferredOrFirstOptionForField(
    fieldLabel: RegExp,
    preferredOption: string | RegExp,
  ) {
    let selectedText = "";
    await expect
      .poll(async () => {
        selectedText = await this.selectDropdownOptionForField(fieldLabel, preferredOption, 0, true);
        return selectedText;
      }, {
        timeout: 30000,
      })
      .not.toBe("");

    return selectedText;
  }

  private async selectFirstAvailableOptionForField(fieldLabel: RegExp) {
    let selectedText = "";
    await expect
      .poll(async () => {
        selectedText = await this.selectFirstVisibleOptionForFieldByRole(fieldLabel);
        return selectedText && !/select here/i.test(selectedText) ? selectedText : "";
      }, {
        timeout: 40000,
      })
      .not.toBe("");

    return selectedText;
  }

  private async selectInterestedInOptionOnce() {
    const selectedText = await this.selectRequiredPreferredOrFirstOptionForField(/Interested in/i, /BHK/i);
    if (!selectedText || /select here/i.test(selectedText)) {
      throw new Error("Unable to select a visible Interested in option.");
    }

    return selectedText;
  }

  private async selectFirstVisibleOptionForFieldByRole(fieldLabel: RegExp) {
    const control = await this.clickDropdownControlForField(fieldLabel);
    if (!control) {
      return "";
    }

    await this.page.waitForTimeout(1000);
    const optionPoint = await this.firstVisibleDropdownOptionPointNearControl(control);
    if (!optionPoint) {
      return "";
    }

    await this.page.waitForTimeout(1000);
    await this.page.mouse.click(optionPoint.x, optionPoint.y);
    await this.page.waitForTimeout(1000);
    const selectedText = await this.dropdownTextForField(fieldLabel);
    if (selectedText && !/select here/i.test(selectedText)) {
      await this.closeOpenReceptionDropdownPanels();
      return selectedText;
    }

    await this.closeOpenReceptionDropdownPanels();
    return "";
  }

  private async firstVisibleDropdownOptionPointNearControl(control: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  }) {
    return await this.page
      .evaluate(({ controlBottom, controlLeft, controlRight }) => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const option = Array.from(document.querySelectorAll<HTMLElement>("button"))
          .filter((button) => {
            const rect = button.getBoundingClientRect();
            const text = normalize(button.textContent);
            return (
              isVisible(button) &&
              rect.left <= controlRight + 80 &&
              rect.right >= controlLeft - 80 &&
              rect.top >= controlBottom - 12 &&
              rect.top - controlBottom < 430 &&
              text.length > 0 &&
              !/select here|search|sorry,\s*no results found|reset|submit|clear|cancel/i.test(text)
            );
          })
          .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)[0];
        if (!option) {
          return null;
        }

        const rect = option.getBoundingClientRect();
        return {
          text: normalize(option.textContent),
          x: rect.left + Math.min(rect.width / 2, 180),
          y: rect.top + rect.height / 2,
        };
      }, {
        controlBottom: control.bottom,
        controlLeft: control.left,
        controlRight: control.right,
      })
      .catch(() => null);
  }

  private async closeOpenReceptionDropdownPanels() {
    await this.page.keyboard.press("Escape").catch(() => {});
    await this.page.mouse.click(500, 610).catch(() => {});
    await this.page.waitForTimeout(1000);
  }

  private async selectFirstAvailableSelectHereOption(selectHereIndex: number) {
    return await this.selectVisibleSelectHereOption(selectHereIndex, undefined);
  }

  private async selectVisibleSelectHereOption(
    selectHereIndex: number,
    preferredOption?: string | RegExp,
  ) {
    let selectedText = "";
    await expect
      .poll(async () => {
        selectedText = await this.clickSelectHereDropdownOption(selectHereIndex, preferredOption);
        return selectedText && !/select here/i.test(selectedText) ? selectedText : "";
      }, {
        timeout: 30000,
      })
      .not.toBe("");

    return selectedText;
  }

  private async clickSelectHereDropdownOption(
    selectHereIndex: number,
    preferredOption?: string | RegExp,
  ) {
    const dropdown = this.page.getByRole("button", { name: "Select here" }).nth(selectHereIndex);
    if (!await dropdown.isVisible({ timeout: 4000 }).catch(() => false)) {
      return "";
    }

    await dropdown.scrollIntoViewIfNeeded().catch(() => {});
    await dropdown.click({ force: true });
    await this.page.waitForTimeout(1000);

    const selectedOptionText = preferredOption
      ? await this.clickVisibleDropdownOption(preferredOption)
      : await this.clickFirstVisibleDropdownOptionBelow(dropdown);
    if (!selectedOptionText) {
      return "";
    }

    await this.page.waitForTimeout(1000);
    const selectedText = ((await dropdown.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    return selectedText && !/select here/i.test(selectedText) ? selectedText : "";
  }

  private async clickVisibleDropdownOption(optionName: string | RegExp) {
    const optionPattern =
      typeof optionName === "string"
        ? new RegExp(`^${escapeRegex(optionName)}$`, "i")
        : optionName;
    const option = this.page.getByRole("button", { name: optionPattern }).first();
    if (!await option.isVisible({ timeout: 4000 }).catch(() => false)) {
      return "";
    }

    const optionText = ((await option.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    await option.click({ force: true });
    return optionText;
  }

  private async clickFirstVisibleDropdownOption() {
    const option = this.page
      .locator("div.overflow-y-auto.max-h-52 button, div[class*='overflow-y-auto'][class*='max-h-52'] button")
      .filter({ hasText: /\S/ })
      .first();
    if (!await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      return "";
    }

    const optionText = ((await option.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    await option.click({ force: true });
    return optionText;
  }

  private async clickFirstVisibleDropdownOptionBelow(dropdown: Locator) {
    const dropdownBox = await dropdown.boundingBox().catch(() => null);
    if (!dropdownBox) {
      return "";
    }

    const optionPoint = await this.page
      .evaluate(({ controlTop, controlBottom, controlLeft, controlRight }) => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const option = Array.from(document.querySelectorAll<HTMLElement>("button"))
          .filter((button) => {
            const rect = button.getBoundingClientRect();
            const text = normalize(button.textContent);
            const overlapsControl = rect.left <= controlRight + 40 && rect.right >= controlLeft - 40;
            const isNearOpenDropdown = rect.top >= controlBottom - 8 && rect.top - controlBottom < 360;
            return (
              isVisible(button) &&
              overlapsControl &&
              isNearOpenDropdown &&
              text.length > 0 &&
              !/select here|search|sorry,\s*no results found|reset|submit|clear|cancel/i.test(text)
            );
          })
          .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)[0];
        if (!option) {
          return null;
        }

        const rect = option.getBoundingClientRect();
        return {
          text: normalize(option.textContent),
          x: rect.left + Math.min(rect.width / 2, 160),
          y: rect.top + rect.height / 2,
        };
      }, {
        controlTop: dropdownBox.y,
        controlBottom: dropdownBox.y + dropdownBox.height,
        controlLeft: dropdownBox.x,
        controlRight: dropdownBox.x + dropdownBox.width,
      })
      .catch(() => null);

    if (!optionPoint) {
      return "";
    }

    await this.page.mouse.click(optionPoint.x, optionPoint.y);
    return optionPoint.text;
  }

  private async selectFirstVisibleDropdownOptionForField(fieldLabel: RegExp) {
    const control = await this.clickDropdownControlForField(fieldLabel);
    if (!control) {
      return "";
    }

    const openPanel = this.page.locator("div.absolute.left-0.mt-2.w-full").last();
    if (!await openPanel.isVisible({ timeout: 4000 }).catch(() => false)) {
      return "";
    }

    const option = this.page
      .locator("div.overflow-y-auto.max-h-52 button, div[class*='overflow-y-auto'][class*='max-h-52'] button")
      .filter({ hasText: /\S/ })
      .first();
    if (!await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      const panelBox = await openPanel.boundingBox().catch(() => null);
      if (!panelBox) {
        return "";
      }

      await this.page.mouse.click(panelBox.x + Math.min(panelBox.width / 2, 180), panelBox.y + 92);
      await this.page.waitForTimeout(500);
      const selectedText = await this.dropdownTextForField(fieldLabel);
      return selectedText && !/select here/i.test(selectedText) ? selectedText : "";
    }

    const optionText = ((await option.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    await option.scrollIntoViewIfNeeded().catch(() => {});
    await option.click({ force: true });
    await this.page.waitForTimeout(500);
    const selectedText = await this.dropdownTextForField(fieldLabel);
    if (selectedText && !/select here/i.test(selectedText)) {
      return selectedText;
    }

    const panelBox = await openPanel.boundingBox().catch(() => null);
    if (!panelBox) {
      return optionText;
    }

    await this.page.mouse.click(panelBox.x + Math.min(panelBox.width / 2, 180), panelBox.y + 92);
    await this.page.waitForTimeout(500);
    const selectedTextAfterCoordinateClick = await this.dropdownTextForField(fieldLabel);
    return selectedTextAfterCoordinateClick && !/select here/i.test(selectedTextAfterCoordinateClick)
      ? selectedTextAfterCoordinateClick
      : optionText;
  }

  private async selectRequiredPreferredOrFirstOptionForField(
    fieldLabel: RegExp,
    preferredOption: string | RegExp,
  ) {
    let selectedText = "";
    await expect
      .poll(async () => {
        selectedText = await this.selectDropdownOptionForField(fieldLabel, preferredOption, 0, true);
        return selectedText && !/select here/i.test(selectedText) ? selectedText : "";
      }, {
        timeout: 30000,
      })
      .not.toBe("");

    return selectedText;
  }

  private async selectAssignedTo(preferredAssignee: string) {
    await this.scrollFieldLabelToCenter(/Assigned to/i);
    await this.page.waitForTimeout(300);
    let selectedText = await this.assignedToDropdownText();
    if (selectedText && !/select here/i.test(selectedText)) {
      return selectedText;
    }

    await expect
      .poll(async () => {
        const clickedOptionText = await this.selectAssignedToOptionFromOpenPanel(preferredAssignee);
        if (!clickedOptionText) {
          return false;
        }

        selectedText = await this.assignedToDropdownText();
        if (!selectedText || /select here/i.test(selectedText)) {
          selectedText = clickedOptionText;
        }
        return true;
      }, { timeout: 30000 })
      .toBeTruthy();

    return selectedText || preferredAssignee;
  }

  private async selectAssignedToOptionFromOpenPanel(preferredAssignee: string) {
    const dropdown = this.dropdownForField(/Assigned to/i);
    await dropdown.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    }).catch(() => {});
    await dropdown.click({ force: true }).catch(() => {});

    const openPanel = this.page.locator("div.absolute.left-0.mt-2.w-full").last();
    await expect(openPanel).toBeVisible({ timeout: 3000 }).catch(() => {});

    const preferredPattern = new RegExp(`^${escapeRegex(preferredAssignee)}$`, "i");
    const preferredOption = openPanel.getByRole("button", { name: preferredPattern }).first();
    const firstOption = openPanel.locator("button").filter({ hasText: /\S/ }).first();

    const clickedPreferred = await preferredOption
      .click({ force: true, timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (clickedPreferred) {
      await this.page.waitForTimeout(500);
      return preferredAssignee;
    }

    const firstOptionText = ((await firstOption.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    const clickedFirst = await firstOption
      .click({ force: true, timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    await this.page.waitForTimeout(500);
    return clickedFirst ? firstOptionText : "";
  }

  private async scrollFieldLabelToCenter(fieldLabel: RegExp) {
    await this.page
      .evaluate(({ labelSource, labelFlags }) => {
        const labelPattern = new RegExp(labelSource, labelFlags);
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const label = Array.from(document.querySelectorAll<HTMLElement>("label,p,span,div"))
          .find((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            const text = normalize(element.textContent);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== "hidden" &&
              style.display !== "none" &&
              text.length < 80 &&
              labelPattern.test(text)
            );
          });

        label?.scrollIntoView({ block: "center", inline: "nearest" });
      }, {
        labelSource: fieldLabel.source,
        labelFlags: fieldLabel.flags,
      })
      .catch(() => {});
  }

  private async selectAssignedToOption(preferredAssignee: string) {
    const buttonPoint = await this.page
      .evaluate(() => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const assignedLabel = Array.from(document.querySelectorAll<HTMLElement>("label,p,span,div"))
          .find((element) => {
            const text = normalize(element.textContent);
            return isVisible(element) && text.length < 40 && /^Assigned to\s*\*?$/i.test(text);
          });
        if (!assignedLabel) {
          return null;
        }

        const labelBox = assignedLabel.getBoundingClientRect();
        const assignedButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
          .filter((button) => {
            const rect = button.getBoundingClientRect();
            return (
              isVisible(button) &&
              rect.left <= labelBox.left + 560 &&
              rect.right >= labelBox.left - 40 &&
              rect.top >= labelBox.bottom - 8 &&
              rect.top - labelBox.bottom < 150 &&
              normalize(button.textContent).length > 0
            );
          })
          .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)[0];
        if (!assignedButton) {
          return null;
        }

        assignedButton.scrollIntoView({ block: "center", inline: "nearest" });
        const buttonBox = assignedButton.getBoundingClientRect();
        return {
          x: buttonBox.left + buttonBox.width - 32,
          y: buttonBox.top + buttonBox.height / 2,
          left: buttonBox.left,
          right: buttonBox.right,
          bottom: buttonBox.bottom,
        };
      })
      .catch(() => null);
    if (!buttonPoint) {
      return false;
    }

    await this.page.mouse.click(buttonPoint.x, buttonPoint.y);
    await this.page.waitForTimeout(500);

    const optionPoint = await this.page
      .evaluate(({ assigneeName, buttonPoint }) => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const options = Array.from(document.querySelectorAll<HTMLElement>("button,[role='option'],[role='menuitem'],[class*='cursor-pointer'],li,div,p,span"))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const text = normalize(element.textContent);
            return (
              isVisible(element) &&
              rect.left >= buttonPoint.left - 8 &&
              rect.right <= buttonPoint.right + 28 &&
              rect.top >= buttonPoint.bottom - 8 &&
              rect.top - buttonPoint.bottom < 360 &&
              text.length > 0 &&
              text.length < 80 &&
              !/select here|search|sorry,\s*no results found|reset|submit|clear|cancel/i.test(text)
            );
          })
          .sort((left, right) => {
            const leftBox = left.getBoundingClientRect();
            const rightBox = right.getBoundingClientRect();
            return (leftBox.top - buttonPoint.bottom) - (rightBox.top - buttonPoint.bottom);
          });
        const preferredOption = options.find((element) => normalize(element.textContent).toLowerCase() === assigneeName.toLowerCase());
        const option = preferredOption || options[0];
        if (!option) {
          return null;
        }

        const optionBox = option.getBoundingClientRect();
        return {
          x: optionBox.left + Math.min(optionBox.width / 2, 120),
          y: optionBox.top + optionBox.height / 2,
        };
      }, {
        assigneeName: preferredAssignee,
        buttonPoint,
      })
      .catch(() => null);

    if (!optionPoint) {
      return false;
    }

    await this.page.mouse.click(optionPoint.x, optionPoint.y);
    await this.page.waitForTimeout(500);
    return true;
  }

  private async assignedToDropdownText() {
    return await this.page
      .evaluate(() => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const assignedLabel = Array.from(document.querySelectorAll<HTMLElement>("label,p,span,div"))
          .find((element) => {
            const text = normalize(element.textContent);
            return isVisible(element) && text.length < 40 && /^Assigned to\s*\*?$/i.test(text);
          });
        if (!assignedLabel) {
          return "";
        }

        const labelBox = assignedLabel.getBoundingClientRect();
        const assignedButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
          .filter((button) => {
            const rect = button.getBoundingClientRect();
            return (
              isVisible(button) &&
              rect.left <= labelBox.left + 560 &&
              rect.right >= labelBox.left - 40 &&
              rect.top >= labelBox.bottom - 8 &&
              rect.top - labelBox.bottom < 150
            );
          })
          .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)[0];

        return normalize(assignedButton?.querySelector("span")?.textContent || assignedButton?.textContent);
      })
      .catch(() => "");
  }

  private async selectDropdownOptionForField(
    fieldLabel: RegExp,
    optionName: string | RegExp,
    optionIndex: number,
    allowFallback: boolean,
  ) {
    const control = await this.clickDropdownControlForField(fieldLabel);
    if (!control) {
      return "";
    }

    const openPanel = this.page.locator("div.absolute.left-0.mt-2.w-full").last();
    const panelOpened = await openPanel
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    if (!panelOpened) {
      return "";
    }

    if (typeof optionName === "string") {
      const searchBox = openPanel
        .locator("input[placeholder*='Search'], input, textarea")
        .first();
      if (await searchBox.isVisible({ timeout: 1000 }).catch(() => false)) {
        await searchBox.click({ force: true }).catch(() => {});
        await searchBox.fill(optionName).catch(() => {});
        await this.page.waitForTimeout(300);
      }
    }

    const optionPattern =
      typeof optionName === "string"
        ? new RegExp(`^${escapeRegex(optionName)}$`, "i")
        : optionName;
    const clickedOptionText = await this.clickOptionByScrollingOpenDropdownPanel(
      openPanel,
      optionPattern,
      optionIndex,
      allowFallback,
    ) || await this.clickOptionInsideOpenDropdownPanel(
      openPanel,
      optionPattern,
      optionIndex,
      allowFallback,
    );

    return clickedOptionText
      ? await this.waitForDropdownSelection(fieldLabel, clickedOptionText)
      : "";
  }

  private async clickOptionByScrollingOpenDropdownPanel(
    openPanel: Locator,
    optionPattern: RegExp,
    optionIndex: number,
    allowFallback: boolean,
  ) {
    const option = openPanel.getByRole("button", { name: optionPattern }).nth(optionIndex);

    for (let attempt = 0; attempt < 16; attempt += 1) {
      if (await option.isVisible({ timeout: 300 }).catch(() => false)) {
        const optionText = ((await option.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
        await option.click({ force: true });
        return optionText;
      }

      const panelBox = await openPanel.boundingBox().catch(() => null);
      if (panelBox) {
        await this.page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + panelBox.height / 2);
      } else {
        await openPanel.hover({ force: true }).catch(() => {});
      }
      await this.page.mouse.wheel(0, 260);
      await this.page.waitForTimeout(120);
    }

    if (!allowFallback) {
      return "";
    }

    const firstVisibleOption = openPanel.locator("button").filter({ hasText: /\S/ }).first();
    if (!await firstVisibleOption.isVisible({ timeout: 1000 }).catch(() => false)) {
      return "";
    }

    const firstOptionText = ((await firstVisibleOption.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    await firstVisibleOption.click({ force: true });
    return firstOptionText;
  }

  private async clickOptionInsideOpenDropdownPanel(
    openPanel: Locator,
    optionPattern: RegExp,
    optionIndex: number,
    allowFallback: boolean,
  ) {
    const optionPoint = await openPanel
      .evaluate(async (panel, { optionSource, optionFlags, optionIndex, allowFallback }) => {
        const pattern = new RegExp(optionSource, optionFlags);
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const wait = (timeout: number) => new Promise((resolve) => window.setTimeout(resolve, timeout));
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const scrollContainer =
          Array.from(panel.querySelectorAll<HTMLElement>("div,ul,[role='listbox'],[role='menu']"))
            .filter((element) => {
              const style = window.getComputedStyle(element);
              return element.scrollHeight > element.clientHeight + 8 && /(auto|scroll)/i.test(`${style.overflowY}${style.overflow}`);
            })
            .sort((left, right) => right.scrollHeight - left.scrollHeight)[0] ?? panel;
        const optionSelector = "button,[role='option'],[role='menuitem'],[class*='cursor-pointer']";
        const options = () => Array.from(panel.querySelectorAll<HTMLElement>(optionSelector))
          .filter((element) => {
            const text = normalize(element.textContent);
            return text && !/select here|sorry,\s*no results found|reset|submit|clear|cancel/i.test(text);
          });
        const findOption = () => {
          const matchingOptions = options().filter((element) => pattern.test(normalize(element.textContent)));
          return matchingOptions[optionIndex] ?? (allowFallback ? options().find(isVisible) : undefined);
        };

        let option = findOption();
        for (let attempt = 0; !option && attempt < 20; attempt += 1) {
          scrollContainer.scrollTop += Math.max(80, scrollContainer.clientHeight * 0.8);
          await wait(80);
          option = findOption();
        }
        if (!option) {
          scrollContainer.scrollTop = 0;
          await wait(80);
          option = findOption();
        }
        if (!option) {
          return null;
        }

        const clickable = option.closest<HTMLElement>("button,[role='option'],[role='menuitem'],[class*='cursor-pointer']") ?? option;
        clickable.scrollIntoView({ block: "center", inline: "nearest" });
        await wait(100);
        const rect = clickable.getBoundingClientRect();
        return {
          text: normalize(option.textContent),
          x: rect.left + Math.min(rect.width / 2, 140),
          y: rect.top + rect.height / 2,
        };
      }, {
        optionSource: optionPattern.source,
        optionFlags: optionPattern.flags,
        optionIndex,
        allowFallback,
      })
      .catch(() => null);

    if (!optionPoint) {
      return "";
    }

    await this.page.mouse.click(optionPoint.x, optionPoint.y);
    return optionPoint.text;
  }

  private async waitForDropdownSelection(fieldLabel: RegExp, expectedSelection: string | RegExp) {
    await this.page.waitForTimeout(300);
    await this.page.keyboard.press("Escape").catch(() => {});

    const selectedText = await expect
      .poll(async () => {
        const text = await this.dropdownTextForField(fieldLabel);
        if (!text || /select here/i.test(text)) {
          return "";
        }
        return this.matchesOptionText(text, expectedSelection) || typeof expectedSelection !== "string"
          ? text
          : text;
      }, { timeout: 5000 })
      .not.toBe("")
      .then(async () => this.dropdownTextForField(fieldLabel))
      .catch(() => "");

    return selectedText && !/select here/i.test(selectedText) ? selectedText : "";
  }

  private async clickDropdownControlForField(fieldLabel: RegExp) {
    await this.page.keyboard.press("Escape").catch(() => {});

    return await this.page
      .evaluate(({ labelSource, labelFlags }) => {
        const labelPattern = new RegExp(labelSource, labelFlags);
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const labels = Array.from(document.querySelectorAll<HTMLElement>("label,p,span,h1,h2,h3,h4,div"))
          .filter((element) => {
            const text = normalize(element.textContent);
            return isVisible(element) && text.length < 80 && labelPattern.test(text);
          });
        const label = labels
          .sort((left, right) => left.getBoundingClientRect().height - right.getBoundingClientRect().height)[0];
        if (!label) {
          return null;
        }

	        const labelBox = label.getBoundingClientRect();
	        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
	        const labelIsLeftColumn = labelBox.left < viewportWidth / 2;
	        const controls = Array.from(document.querySelectorAll<HTMLElement>("button,[role='button'],[class*='cursor-pointer'],[class*='rounded-full']"))
	          .filter((element) => {
	            const rect = element.getBoundingClientRect();
	            const text = normalize(element.textContent);
	            const horizontallyNear = rect.left <= labelBox.left + 560 && rect.right >= labelBox.left - 40;
	            const controlCenter = rect.left + rect.width / 2;
	            const sameColumn = labelIsLeftColumn
	              ? controlCenter < viewportWidth / 2
	              : controlCenter >= viewportWidth / 2;
	            return (
	              isVisible(element) &&
	              horizontallyNear &&
	              sameColumn &&
	              rect.top >= labelBox.bottom - 8 &&
	              rect.top - labelBox.bottom < 150 &&
	              text.length > 0 &&
              !/reset|submit|clear|terms|conditions/i.test(text)
            );
          })
          .sort((left, right) => {
            const leftBox = left.getBoundingClientRect();
            const rightBox = right.getBoundingClientRect();
            return (leftBox.top - labelBox.bottom) - (rightBox.top - labelBox.bottom);
          });
        const control = controls[0];
        if (!control) {
          return null;
        }

        control.scrollIntoView({ block: "center", inline: "nearest" });
        const rect = control.getBoundingClientRect();
        control.click();
        return {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        };
      }, {
        labelSource: fieldLabel.source,
        labelFlags: fieldLabel.flags,
      })
      .catch(() => null);
  }

  private async clickDropdownOptionByGeometry(
    controlTop: number,
    controlBottom: number,
    controlLeft: number,
    controlRight: number,
    optionName: string | RegExp,
    optionIndex: number,
    allowFallback: boolean,
  ) {
    const optionPoint = await this.page
      .evaluate(async ({ controlTop, controlBottom, controlLeft, controlRight, optionSource, optionFlags, optionIndex, allowFallback }) => {
        const optionPattern = new RegExp(optionSource, optionFlags);
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const wait = (timeout: number) => new Promise((resolve) => window.setTimeout(resolve, timeout));
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const getScrollableOptionPanel = () => Array.from(document.querySelectorAll<HTMLElement>("div,ul,[role='listbox'],[role='menu']"))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            const overlapsControl = rect.left <= controlRight + 120 && rect.right >= controlLeft - 120;
            const opensBelow = rect.top >= controlBottom - 28 && rect.top - controlBottom < 240;
            const opensAbove = rect.bottom <= controlTop + 28 && controlTop - rect.bottom < 480;
            const overlaysControl = rect.top <= controlBottom + 80 && rect.bottom >= controlTop - 80;
            return (
              isVisible(element) &&
              overlapsControl &&
              (opensBelow || opensAbove || overlaysControl) &&
              element.scrollHeight > element.clientHeight + 20 &&
              /(auto|scroll)/i.test(`${style.overflowY}${style.overflow}`)
            );
          })
          .sort((left, right) => right.clientHeight - left.clientHeight)[0];
        const optionPanel = getScrollableOptionPanel();
        const candidateSelector = "button,[role='option'],[role='menuitem'],[class*='cursor-pointer'],li,div,p,span";
        const getCandidates = () => Array.from(document.querySelectorAll<HTMLElement>(candidateSelector))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const text = normalize(element.textContent);
            const overlapsControl = rect.left <= controlRight + 80 && rect.right >= controlLeft - 80;
            const insidePanel = optionPanel ? optionPanel.contains(element) : false;
            const nearControl = (
              rect.top >= controlBottom - 12 &&
              rect.top - controlBottom < 430
            ) || (
              rect.bottom <= controlTop + 12 &&
              controlTop - rect.bottom < 430
            );
            return (
              isVisible(element) &&
              (insidePanel || (overlapsControl && nearControl)) &&
              text.length > 0 &&
              text.length < 120 &&
              !/^(search)$/i.test(text) &&
              !/select here|sorry,\s*no results found|reset|submit|clear|cancel|from date|to date/i.test(text)
            );
          })
          .sort((left, right) => {
            const leftBox = left.getBoundingClientRect();
            const rightBox = right.getBoundingClientRect();
            return (leftBox.width * leftBox.height) - (rightBox.width * rightBox.height);
          });
        const getTarget = () => {
          const candidates = getCandidates();
          const exactMatches = candidates.filter((element) => optionPattern.test(normalize(element.textContent)));
          return exactMatches[optionIndex] || (allowFallback ? candidates[0] : undefined);
        };

        let target = getTarget();
        for (let attempt = 0; !target && optionPanel && attempt < 18; attempt += 1) {
          optionPanel.scrollTop += Math.max(80, optionPanel.clientHeight * 0.75);
          await wait(120);
          target = getTarget();
        }
        if (!target && optionPanel) {
          optionPanel.scrollTop = 0;
          await wait(120);
          target = getTarget();
        }
        if (!target) {
          return "";
        }

        const clickable = target.closest<HTMLElement>("button,[role='option'],[role='menuitem'],[class*='cursor-pointer'],li") ?? target;
        clickable.scrollIntoView({ block: "center", inline: "nearest" });
        const rect = clickable.getBoundingClientRect();
        return {
          text: normalize(target.textContent),
          x: rect.left + Math.min(rect.width / 2, 120),
          y: rect.top + rect.height / 2,
        };
      }, {
        controlTop,
        controlBottom,
        controlLeft,
        controlRight,
        optionSource: typeof optionName === "string" ? `^${escapeRegex(optionName)}$` : optionName.source,
        optionFlags: typeof optionName === "string" ? "i" : optionName.flags,
        optionIndex,
        allowFallback,
      })
      .catch(() => null);

    if (!optionPoint) {
      return "";
    }

    await this.page.mouse.click(optionPoint.x, optionPoint.y);
    return optionPoint.text;
  }

  private async dropdownTextForField(fieldLabel: RegExp) {
    return await this.page
      .evaluate(({ labelSource, labelFlags }) => {
        const labelPattern = new RegExp(labelSource, labelFlags);
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const label = Array.from(document.querySelectorAll<HTMLElement>("label,p,span,h1,h2,h3,h4,div"))
          .filter((element) => {
            const text = normalize(element.textContent);
            return isVisible(element) && text.length < 80 && labelPattern.test(text);
          })
          .sort((left, right) => left.getBoundingClientRect().height - right.getBoundingClientRect().height)[0];
        if (!label) {
          return "";
        }

	        const labelBox = label.getBoundingClientRect();
	        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
	        const labelIsLeftColumn = labelBox.left < viewportWidth / 2;
	        const control = Array.from(document.querySelectorAll<HTMLElement>("button,[role='button'],[class*='cursor-pointer'],[class*='rounded-full']"))
	          .filter((element) => {
	            const rect = element.getBoundingClientRect();
	            const text = normalize(element.textContent);
	            const controlCenter = rect.left + rect.width / 2;
	            const sameColumn = labelIsLeftColumn
	              ? controlCenter < viewportWidth / 2
	              : controlCenter >= viewportWidth / 2;
	            return (
	              isVisible(element) &&
	              sameColumn &&
	              rect.left <= labelBox.left + 560 &&
	              rect.right >= labelBox.left - 40 &&
	              rect.top >= labelBox.bottom - 8 &&
              rect.top - labelBox.bottom < 150 &&
              text.length > 0 &&
              !/reset|submit|clear|terms|conditions/i.test(text)
            );
          })
          .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)[0];
        return normalize(control?.textContent);
      }, {
        labelSource: fieldLabel.source,
        labelFlags: fieldLabel.flags,
      })
      .catch(() => "");
  }

  private dropdownForField(fieldLabel: RegExp) {
    return this.page
      .getByText(fieldLabel)
      .locator("xpath=following::button[not(@disabled)][1]")
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
    const optionCandidates = [
      this.page.getByRole("button", { name: optionPattern }).nth(optionIndex),
      this.page.locator("button").filter({ hasText: optionPattern }).nth(optionIndex),
      this.page.getByText(optionPattern).nth(optionIndex),
    ];

    const selected = await expect
      .poll(async () => {
        await dropdown.click({ force: true }).catch(() => {});
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

  private async selectFirstAvailableOptionFromDropdown(dropdown: Locator) {
    await expect(dropdown).toBeVisible({ timeout: 30000 });

    const selectedText = await expect
      .poll(async () => {
        await dropdown.click({ force: true }).catch(() => {});

        const optionText = await this.clickFirstDropdownOptionBelow(dropdown);
        if (!optionText) {
          return "";
        }

        const fieldText = await dropdown.textContent().catch(() => "");
        const normalizedFieldText = (fieldText || "").replace(/\s+/g, " ").trim();
        return /select here/i.test(normalizedFieldText) ? "" : normalizedFieldText || optionText;
      }, { timeout: 30000 })
      .not.toBe("")
      .then(async () => ((await dropdown.textContent()) || "").replace(/\s+/g, " ").trim());

    return selectedText;
  }

  private async clickFirstDropdownOptionBelow(dropdown: Locator) {
    const dropdownBox = await dropdown.boundingBox().catch(() => null);
    if (!dropdownBox) {
      return "";
    }

    return await this.page
      .evaluate((minY) => {
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
        const option = Array.from(document.querySelectorAll<HTMLElement>("button,[role='option'],[role='menuitem'],[class*='cursor-pointer']")).find((button) => {
          const rect = button.getBoundingClientRect();
          const text = (button.textContent || "").replace(/\s+/g, " ").trim();
          return (
            isVisible(button) &&
            rect.top >= minY - 4 &&
            Boolean(text) &&
            !/select here|sorry,\s*no results found|reset|submit|clear|cancel/i.test(text)
          );
        });
        if (!option) {
          return "";
        }

        const text = (option.textContent || "").replace(/\s+/g, " ").trim();
        option.scrollIntoView({ block: "center", inline: "nearest" });
        option.click();
        return text;
      }, dropdownBox.y + dropdownBox.height)
      .catch(() => "");
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

    const confirmedPhoneInput = await this.visibleReceptionPhoneInput();
    await expect(confirmedPhoneInput).toHaveValue(phone, { timeout: 10000 });
  }

  private async fillReceptionOtp(otp: string) {
    const otpInput = this.page.locator("#otp").first();

    await expect(otpInput).toBeVisible({ timeout: 30000 });
    await otpInput.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    }).catch(() => {});
    await otpInput.click({ force: true });
    await otpInput.fill("").catch(() => {});
    await otpInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
    await otpInput.pressSequentially(otp, { delay: 80 }).catch(async () => {
      await fillWithFallback(otpInput, otp);
    });

    await expect
      .poll(async () => await otpInput.inputValue().catch(() => ""), { timeout: 10000 })
      .toBe(otp);

    await this.triggerOtpVerification();
  }

  private async visibleReceptionPhoneInput() {
    const candidates = [
      this.page
        .getByText(/Phone\/WhatsApp Number/i)
        .locator("xpath=following::input[1]")
        .first(),
      this.page
        .getByRole("heading", { name: /Phone\/WhatsApp Number/i })
        .locator("xpath=following::input[1]")
        .first(),
      this.phoneInput,
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
    const otpInput = this.page.locator("#otp").first();
    await otpInput.click({ force: true }).catch(async () => {
      await this.page.getByText("Personal Details").click({ force: true }).catch(async () => {
        await this.page.locator("body").click({ position: { x: 20, y: 20 } });
      });
    });

    await expect
      .poll(async () => (
        await this.page.getByText(/OTP\s*Sent|Resend in/i).first().isVisible().catch(() => false) ||
        await otpInput.isEditable().catch(() => false)
      ), { timeout: 30000 })
      .toBeTruthy();
  }

  private async verifyReceptionOtp() {
    await expect
      .poll(async () => {
        await this.triggerOtpVerification();
        return await this.page.getByText(/OTP\s*Verified|Verified/i).first().isVisible().catch(() => false);
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  private async triggerOtpVerification() {
    const otpInput = this.page.locator("#otp").first();
    await otpInput
      .evaluate((element) => {
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new Event("blur", { bubbles: true }));
      })
      .catch(() => {});
    await otpInput.press("Tab").catch(() => {});
    await this.page.locator("#email").first().click({ force: true }).catch(async () => {
      await this.page.getByText("Personal Details").click({ force: true }).catch(async () => {
        await this.page.locator("body").click({ position: { x: 20, y: 20 } });
      });
    });
    await this.page.waitForTimeout(750);
  }

  private async setFieldValueWithNativeEvents(fieldId: string, labelPattern: RegExp, value: string) {
    return await this.page
      .evaluate(({ fieldId: targetFieldId, labelSource, labelFlags, value: nextValue }) => {
        const directField = document.getElementById(targetFieldId) as HTMLInputElement | HTMLTextAreaElement | null;
        const labelPattern = new RegExp(labelSource, labelFlags);
        const label = Array.from(document.querySelectorAll<HTMLElement>("*")).find((element) => labelPattern.test(element.textContent || ""));
        const fallbackField = label?.parentElement?.querySelector("input,textarea") as HTMLInputElement | HTMLTextAreaElement | null;
        const field = directField || fallbackField;
        if (!field) {
          return false;
        }

        field.scrollIntoView({ block: "center", inline: "nearest" });
        const valueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
        valueSetter?.call(field, nextValue);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        field.dispatchEvent(new Event("blur", { bubbles: true }));
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

  private async expectSubmitEnabledWithDiagnostics() {
    const submitButton = this.page.getByRole("button", { name: "Submit" });
    const enabled = await expect(submitButton)
      .toBeEnabled({ timeout: 30000 })
      .then(() => true)
      .catch(() => false);

    if (enabled) {
      return;
    }

    const diagnostics = await this.receptionRequiredFieldSnapshot();
    throw new Error(`Reception form Submit is still disabled. Required field snapshot:\n${diagnostics}`);
  }

  private async receptionRequiredFieldSnapshot() {
    return await this.page
      .evaluate(() => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const fields = Array.from(document.querySelectorAll<HTMLElement>("label,p,span,div"))
          .filter((element) => {
            const text = normalize(element.textContent);
            return isVisible(element) && text.length > 0 && text.length < 90 && /\*/.test(text);
          })
          .map((label) => {
            const text = normalize(label.textContent);
            const labelBox = label.getBoundingClientRect();
            const field = Array.from(document.querySelectorAll<HTMLElement>("input,textarea,button,[role='button']"))
              .filter((element) => {
                const rect = element.getBoundingClientRect();
                return (
                  isVisible(element) &&
                  rect.top >= labelBox.bottom - 12 &&
                  rect.top - labelBox.bottom < 120 &&
                  rect.left <= labelBox.left + 620 &&
                  rect.right >= labelBox.left - 60
                );
              })
              .sort((left, right) => {
                const leftBox = left.getBoundingClientRect();
                const rightBox = right.getBoundingClientRect();
                return (leftBox.top - labelBox.bottom) - (rightBox.top - labelBox.bottom);
              })[0] as HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | undefined;
            const value = field
              ? ("value" in field ? field.value : normalize((field as HTMLElement).textContent))
              : "";
            return `${text}: ${value || "<empty>"}`;
          });

        const submit = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
          .find((button) => /^Submit$/i.test(normalize(button.textContent)));
        return [
          ...fields,
          `Submit disabled: ${String(Boolean(submit?.disabled || submit?.getAttribute("aria-disabled") === "true"))}`,
          `Terms visible text: ${normalize(document.body.textContent).includes("I agree with the Terms")}`,
          `OTP verified visible: ${/OTP\s*Verified|Verified/i.test(normalize(document.body.textContent))}`,
        ].join("\n");
      })
      .catch((error) => `Unable to collect diagnostics: ${String(error)}`);
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
