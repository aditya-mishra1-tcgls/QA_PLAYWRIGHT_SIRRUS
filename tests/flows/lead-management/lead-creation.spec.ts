import { test, expect } from "../../support/test";
import {
  assertLeadCreated,
  createLeadAndExpectDuplicatePrevented,
  fillLeadForm,
  goToManageLeads,
  validateCreateLeadAndChangeStage,
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

  test("Validate add lead form fields, create lead, and change stage", async ({
    page,
    app,
  }) => {
    await goToManageLeads(page, app);

    await validateCreateLeadAndChangeStage(page, app);
  });

  test("Add duplicate lead with same number shows duplicate warning", async ({
    page,
    app,
  }, testInfo) => {
    testInfo.setTimeout(240000);

    await goToManageLeads(page, app);

    await createLeadAndExpectDuplicatePrevented(page, app);
  });
});
