import { expect, test } from "../../support/test";

test.describe("Application health checks", () => {
  test("Open configured Sirrus environment homepage", async ({ page, app }) => {
    await test.step("Open configured environment homepage", async () => {
      await page.goto(app.baseUrl);
    });
    await test.step("Verify homepage opened", async () => {
      await expect(page).toHaveURL(/.+/);
    });
  });

  test("Resolve active environment base URL", async ({ app }) => {
    await test.step("Verify active environment URL", async () => {
      expect(app.baseUrl).toContain("sirrus.ai");
      expect(["qa", "uat"]).toContain(app.envName);
    });
  });
});
