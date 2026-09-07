import { test, expect } from "../../support/test";
import {
  assertLeadCreated,
  assertSiteVisitStageCasesOnOpenedLead,
  fillLeadForm,
  goToManageLeads,
  openLeadByName
} from "../../support/leads";

test.describe("Site visit stage cases with fresh lead", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 150000));

  test("Create lead and verify site visit stage cases", async ({ page, app }) => {
    await goToManageLeads(page, app);

    const leadSeed = await fillLeadForm(page, app);

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads/);
    await assertLeadCreated(page, leadSeed.fullName, leadSeed.projectName);

    await openLeadByName(page, leadSeed.fullName);
    await assertSiteVisitStageCasesOnOpenedLead(page);
  });
});
