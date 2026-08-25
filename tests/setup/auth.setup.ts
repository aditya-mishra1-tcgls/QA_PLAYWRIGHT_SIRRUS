import { test } from "../support/test";
import { loginToPlatform, saveAuthenticatedState } from "../support/auth";

test("login once and persist auth state", async ({ page, app }) => {
  await loginToPlatform(page, app);
  await saveAuthenticatedState(page, app.envName);
});
