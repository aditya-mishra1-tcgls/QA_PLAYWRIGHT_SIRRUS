import { expect, test } from "../../support/test";

test.describe("Authentication flow", () => {
  test("authenticated user should reach the platform after shared login setup", async ({ page, app }) => {
    await page.goto(new URL("/admin/developer/cpms/manage-construction", app.baseUrl).toString(), { waitUntil: "networkidle" });
    await expect(page).not.toHaveURL(/\/admin\/login/);
    await expect(page).toHaveURL(/\/admin\//);
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("@auth"))).toBeTruthy();
  });

  test("mobile and otp config should be available for the selected env", async ({ app }) => {
    expect(app.mobileNumber).toMatch(/^\d{10}$/);
    expect(app.otp).toMatch(/^\d{4}$/);
  });
});
