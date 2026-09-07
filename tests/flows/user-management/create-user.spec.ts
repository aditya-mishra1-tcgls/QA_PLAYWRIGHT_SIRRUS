import { test } from "../../support/test";
import { createAutomationUser, getConfiguredAdminCredential } from "../../support/users";

test.describe("Admin user management", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 120000));

  test("Admin creates an automation user with email and password", async ({ page, app }) => {
    const adminCredential = getConfiguredAdminCredential(app);

    test.info().annotations.push({
      type: "admin-login-page",
      description: adminCredential.loginPage,
    });

    await createAutomationUser(page, app);
  });
});
