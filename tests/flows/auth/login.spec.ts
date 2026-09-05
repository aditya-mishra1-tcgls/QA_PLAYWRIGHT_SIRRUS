import { expect, test } from "../../support/test";

test.describe("Authentication access checks", () => {
  test("Verify authenticated user lands inside Sirrus platform", async ({ page, app }) => {
    await page.goto(new URL("/admin/developer/cpms/manage-construction", app.baseUrl).toString(), { waitUntil: "networkidle" });
    await expect(page).not.toHaveURL(/\/admin\/login/);
    await expect(page).toHaveURL(/\/admin\//);
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("@auth"))).toBeTruthy();
  });

  test("Verify selected environment has login mobile and OTP", async ({ app }) => {
    expect(app.mobileNumber).toMatch(/^\d{10}$/);
    expect(app.otp).toMatch(/^\d{4}$/);
  });
});
