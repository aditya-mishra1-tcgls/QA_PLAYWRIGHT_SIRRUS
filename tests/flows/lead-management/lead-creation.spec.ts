import { test, expect } from "../../support/test";
import { assertLeadCreated, fillLeadForm, goToManageLeads } from "../../support/leads";

test.describe("Lead management flow", () => {
  test("user should create a lead from Engagement Intelligence", async ({ page, app }) => {
    await goToManageLeads(page, app);

    const leadSeed = await fillLeadForm(page, app);

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads/);
    await assertLeadCreated(page, leadSeed.fullName, leadSeed.projectName);
  });
});
