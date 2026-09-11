import { expect, test } from "../../support/test";
import { ensureAuthenticatedSession } from "../../support/session";

test.describe("Authentication access checks", () => {
  test("Verify authenticated user lands inside Sirrus platform", async ({ page, app }) => {
    const protectedPath = "/admin/developer/cpms/manage-construction";

    await test.step("Open authenticated page", async () => {
      await page.goto(new URL(protectedPath, app.baseUrl).toString(), { waitUntil: "domcontentloaded" });
      await ensureAuthenticatedSession(page, app, protectedPath);
    });
    await test.step("Verify user is logged in", async () => {
      await expect(page).not.toHaveURL(/\/admin\/login/);
      await expect(page).toHaveURL(/\/admin\//);
      await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("@auth"))).toBeTruthy();
    });
  });

  test("Verify selected environment has login mobile and OTP", async ({ app }) => {
    await test.step("Verify environment credentials are configured", async () => {
      expect(app.mobileNumber).toMatch(/^\d{10}$/);
      expect(app.otp).toMatch(/^\d{4}$/);
    });
  });
});
