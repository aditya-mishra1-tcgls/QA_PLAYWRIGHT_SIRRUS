import { expect, type Page } from "@playwright/test";
import { clickWithFallback } from "../support/ui-actions";

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
    return this.page.locator("#mobile_number");
  }

  get continueButton() {
    return this.page.getByRole("button", { name: "Continue" });
  }

  get otpInputs() {
    return this.page.locator('input[inputmode="numeric"]');
  }

  async open(baseUrl: string) {
    await this.page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  }

  async openLoginForm() {
    await clickWithFallback(
      this.loginLink,
      this.page,
      async () => await this.mobileNumberInput.isVisible().catch(() => false)
    );

    await expect(this.page).toHaveURL(/\/admin\/login/);
  }

  async enterMobileNumber(mobileNumber: string) {
    await this.mobileNumberInput.fill(mobileNumber);
  }

  async requestOtp() {
    await clickWithFallback(
      this.continueButton,
      this.page,
      async () => (await this.otpInputs.count().catch(() => 0)) === 4
    );

    await expect(this.otpInputs).toHaveCount(4, { timeout: 30000 });
  }

  async enterOtp(otp: string) {
    for (const [index, digit] of otp.split("").entries()) {
      await this.otpInputs.nth(index).click();
      await this.otpInputs.nth(index).pressSequentially(digit, { delay: 10 });
    }
  }

  async submitAndWaitForHome() {
    const loggedInUserResponse = this.page.waitForResponse((response) => {
      return response.url().includes("/users/loggedInUser") && response.ok();
    }, { timeout: 60000 });

    if (await this.continueButton.isVisible()) {
      await this.continueButton.click();
    }

    await loggedInUserResponse;
    await this.page.waitForURL(/\/admin\/(?!login)/, { timeout: 60000 });
    await expect(this.page).toHaveURL(/\/admin\/(?!login)/);
  }

  async login(app: LoginConfig) {
    await this.open(app.baseUrl);
    await this.openLoginForm();
    await this.enterMobileNumber(app.mobileNumber);
    await this.requestOtp();
    await this.enterOtp(app.otp);
    await this.submitAndWaitForHome();
  }
}
