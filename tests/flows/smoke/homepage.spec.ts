import { expect, test } from "../../support/test";

test.describe("Smoke flow", () => {
  test("homepage should load", async ({ page, app }) => {
    await page.goto(app.baseUrl);
    await expect(page).toHaveURL(/.+/);
  });

  test("environment config should resolve a base url", async ({ app }) => {
    expect(app.baseUrl).toContain("sirrus.ai");
    expect(["qa", "uat"]).toContain(app.envName);
  });
});
