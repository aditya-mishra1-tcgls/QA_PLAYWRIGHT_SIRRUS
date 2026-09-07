import { test, expect } from "../../support/test";
import {
  assertLeadCreated,
  fillLeadForm,
  goToManageLeads,
} from "../../support/leads";

test.describe("Lead creation flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 120000));

  test("Create new lead from Engagement Intelligence", async ({
    page,
    app,
  }) => {
    await goToManageLeads(page, app);

    const leadSeed = await fillLeadForm(page, app);

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads/);
    await assertLeadCreated(page, leadSeed.fullName, leadSeed.projectName);
  });
});
