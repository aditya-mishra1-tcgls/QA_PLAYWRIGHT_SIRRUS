import { test } from "../support/test";
import { loginToPlatform, saveAuthenticatedState } from "../support/auth";

test.setTimeout(120000);

test("Authenticate sales user and save reusable session", async ({ page, app }) => {
  await loginToPlatform(page, app);
  await saveAuthenticatedState(page, app.envName);
});
