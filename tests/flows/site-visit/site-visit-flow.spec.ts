import { test, expect } from "../../support/test";
import {
  assertLeadJourneyStages,
  assertLeadCreated,
  assertSiteVisitStageCasesOnOpenedLead,
  fillLeadForm,
  goToManageLeads,
  moveOpenedLeadToSiteVisitInProgress,
  openLeadByName
} from "../../support/leads";
import {
  assertSiteVisitHistory
} from "../../support/site-visit";

test.describe("Site visit lifecycle flow", () => {
  test.setTimeout(150000);

  test("Create fresh lead and expose site visit controls", async ({ page, app }) => {
    await goToManageLeads(page, app);

    const leadSeed = await fillLeadForm(page, app);

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads/);
    await assertLeadCreated(page, leadSeed.fullName, leadSeed.projectName);

    await openLeadByName(page, leadSeed.fullName);
    await assertSiteVisitStageCasesOnOpenedLead(page);
  });

  test("Validate scheduled to revisit site visit history", async ({ page, app }) => {
    await assertSiteVisitHistory(page, app);
  });

  test("site visit should move from scheduled to in progress", async ({ page, app }) => {
    await goToManageLeads(page, app);

    const leadSeed = await fillLeadForm(page, app);

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads/);
    await assertLeadCreated(page, leadSeed.fullName, leadSeed.projectName);

    await openLeadByName(page, leadSeed.fullName);
    await assertSiteVisitStageCasesOnOpenedLead(page);
    await moveOpenedLeadToSiteVisitInProgress(page);
    await assertLeadJourneyStages(page, ["New Lead", "Site Visit", "In Progress"]);
  });

  test.fixme("site visit should complete with hard-coded OTP 1234", async () => {
    // Pending OTP modal automation on a dedicated in-progress lead.
  });

  test.fixme("site visit should complete through skip OTP path", async () => {
    // Pending skip verification modal automation on a dedicated in-progress lead.
  });

  test.fixme("site visit should support no show outcome", async () => {
    // Pending no-show transition wiring on a dedicated scheduled lead.
  });

  test.fixme("site visit done lead should move to opportunity with remark and next follow up date", async () => {
    // Pending opportunity transition modal wiring on a dedicated visit-done lead.
  });
});
