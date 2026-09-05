import { expect, test } from "../../support/test";

test.describe("Application health checks", () => {
  test("Open configured Sirrus environment homepage", async ({ page, app }) => {
    await page.goto(app.baseUrl);
    await expect(page).toHaveURL(/.+/);
  });

  test("Resolve active environment base URL", async ({ app }) => {
    expect(app.baseUrl).toContain("sirrus.ai");
    expect(["qa", "uat"]).toContain(app.envName);
  });
});
