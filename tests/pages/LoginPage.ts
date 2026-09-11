import { expect, type Locator, type Page } from "@playwright/test";
import { clickWithFallback, fillWithFallback } from "../support/ui-actions";

export type LoginConfig = {
  baseUrl: string;
  mobileNumber: string;
  otp: string;
};

export class LoginPage {
  constructor(private readonly page: Page) {}

  get loginLink() {
    return this.page.getByRole("link", { name: /log in/i });
  }

  get mobileNumberInput() {
    return this.mobileNumberInputCandidates[0];
  }

  get continueButton() {
    return this.page.getByRole("button", { name: "Continue" }).first();
  }

  get otpInputs() {
    return this.page.locator('input[inputmode="numeric"]');
  }

  private get mobileNumberInputCandidates() {
    return [
      this.page.getByRole("textbox", { name: "Enter Mobile Number" }).first(),
      this.page.locator("#mobile_number").first(),
      this.page.locator('input[placeholder*="Mobile" i]').first(),
      this.page.locator('input[name*="mobile" i]').first(),
      this.page.locator('input[type="tel"]').first(),
    ];
  }

  async open(baseUrl: string) {
    await this.page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  }

  async openLoginForm() {
    if (/\/admin\/login/i.test(this.page.url()) && await this.visibleMobileNumberInput()) {
      return;
    }

    await clickWithFallback(
      this.loginLink,
      this.page,
      async () => /\/admin\/login/i.test(this.page.url())
    );

    await expect(this.page).toHaveURL(/\/admin\/login/, { timeout: 30000 });
    await expect
      .poll(async () => await this.visibleMobileNumberInput(), { timeout: 30000 })
      .toBeTruthy();
  }

  async enterMobileNumber(mobileNumber: string) {
    const mobileInput = await this.waitForMobileNumberInput();
    await this.typeMobileNumber(mobileInput, mobileNumber);

    let filled = await mobileInput
      .inputValue()
      .then((value) => value === mobileNumber)
      .catch(() => false);
    if (!filled) {
      filled = await fillWithFallback(mobileInput, mobileNumber);
    }
    if (!filled) {
      filled = await this.setMobileNumberWithNativeEvents(mobileNumber);
    }
    if (!filled) {
      throw new Error("Unable to enter mobile number in login field.");
    }

    await expect
      .poll(async () => await mobileInput.inputValue().catch(() => ""), { timeout: 10000 })
      .toBe(mobileNumber);
  }

  async requestOtp(mobileNumber?: string) {
    if ((await this.otpInputs.count().catch(() => 0)) === 4) {
      return;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (mobileNumber) {
        const mobileInput = await this.waitForMobileNumberInput();
        const currentValue = await mobileInput.inputValue().catch(() => "");
        if (currentValue !== mobileNumber) {
          await this.typeMobileNumber(mobileInput, mobileNumber);
        }
      }

      const enabled = await this.continueButton
        .isEnabled({ timeout: 5000 })
        .catch(() => false);
      if (enabled) {
        await this.continueButton.click({ force: true });
      } else {
        await this.page.keyboard.press("Enter").catch(() => {});
      }

      const otpVisible = await this.otpInputs
        .first()
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (otpVisible && (await this.otpInputs.count().catch(() => 0)) === 4) {
        return;
      }
    }

    await expect(this.otpInputs).toHaveCount(4, { timeout: 30000 });
  }

  async enterOtp(otp: string) {
    for (const [index, digit] of otp.split("").entries()) {
      await this.otpInputs.nth(index).click();
      await this.otpInputs.nth(index).fill(digit);
    }
  }

  async submitAndWaitForHome() {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!await this.continueButton.isVisible().catch(() => false)) {
        break;
      }

      await expect(this.continueButton).toBeEnabled({ timeout: 10000 });
      const clicked = await this.continueButton
        .click({ force: true, timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        await this.page.keyboard.press("Enter").catch(() => {});
      }

      const leftLoginPage = await this.page
        .waitForURL(/\/admin\/(?!login)/, { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (leftLoginPage) {
        break;
      }
    }

    await expect(this.page).toHaveURL(/\/admin\/(?!login)/, { timeout: 60000 });
    await expect
      .poll(
        async () => {
          const auth = await this.page.evaluate(() => window.localStorage.getItem("@auth")).catch(() => null);
          const hasShell = await this.page
            .locator('img[alt*="Profile" i], img[alt*="engagement" i], img[alt*="receptionist" i]')
            .first()
            .isVisible()
            .catch(() => false);

          return Boolean(auth) && !/\/admin\/login/i.test(this.page.url()) && hasShell;
        },
        { timeout: 60000 },
      )
      .toBeTruthy();
  }

  async login(app: LoginConfig) {
    await this.open(app.baseUrl);
    await this.openLoginForm();
    await this.enterMobileNumber(app.mobileNumber);
    await this.requestOtp(app.mobileNumber);
    await this.enterOtp(app.otp);
    await this.submitAndWaitForHome();
  }

  private async visibleMobileNumberInput() {
    for (const candidate of this.mobileNumberInputCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        return true;
      }
    }

    return false;
  }

  private async waitForMobileNumberInput() {
    await expect
      .poll(async () => await this.visibleMobileNumberInput(), { timeout: 30000 })
      .toBeTruthy();

    for (const candidate of this.mobileNumberInputCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }

    throw new Error("Mobile number input was not visible on the login page.");
  }

  private async typeMobileNumber(
    mobileInput: Locator,
    mobileNumber: string,
  ) {
    await mobileInput.scrollIntoViewIfNeeded().catch(() => {});
    await mobileInput.click({ force: true });
    await mobileInput.fill("").catch(() => {});
    await this.page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
    await this.page.keyboard.press("Backspace").catch(() => {});
    await this.page.keyboard.type(mobileNumber, { delay: 30 }).catch(async () => {
      await mobileInput.pressSequentially(mobileNumber, { delay: 30 });
    });
    await mobileInput.blur().catch(() => {});
  }

  private async setMobileNumberWithNativeEvents(mobileNumber: string) {
    return await this.page
      .evaluate((value) => {
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
        const mobileInput = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((input) => {
          const label = [
            input.id,
            input.name,
            input.placeholder,
            input.getAttribute("aria-label"),
            input.type,
          ].join(" ");
          return isVisible(input) && /mobile|phone|tel/i.test(label);
        });

        if (!mobileInput) {
          return false;
        }

        mobileInput.focus();
        const valueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        valueSetter?.call(mobileInput, "");
        mobileInput.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
        valueSetter?.call(mobileInput, value);
        mobileInput.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          data: value,
          inputType: "insertText",
        }));
        mobileInput.dispatchEvent(new KeyboardEvent("keyup", {
          bubbles: true,
          key: value[value.length - 1] || "",
        }));
        mobileInput.dispatchEvent(new Event("change", { bubbles: true }));
        mobileInput.blur();
        mobileInput.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

        return mobileInput.value === value;
      }, mobileNumber)
      .catch(() => false);
  }
}
