import { test } from "../support/test";
import { loginToPlatform, saveAuthenticatedState } from "../support/auth";

test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 120000));

test("Authenticate sales user and save reusable session", async ({ page, app }) => {
  test.info().annotations.push({
    type: "auth-state-key",
    description: process.env.PLAYWRIGHT_AUTH_STATE_KEY || process.env.QA_DASHBOARD_RUN_ID || process.env.QA_DASHBOARD_RUN_USER || app.envName,
  });

  await loginToPlatform(page, app);
  await saveAuthenticatedState(page, app.envName);
});
