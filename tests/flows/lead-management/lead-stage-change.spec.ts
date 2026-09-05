import { test, expect } from "../../support/test";
import {
  assertLeadCreated,
  assertLeadJourneyStages,
  fillLeadForm,
  goToManageLeads,
  moveLeadThroughStages,
  openLeadByName
} from "../../support/leads";

test.describe("Lead stage change flow", () => {
  test.setTimeout(150000);

  test("user should create a lead, move it through multiple stages, and verify the lead journey", async ({ page, app }) => {
    await goToManageLeads(page, app);

    const leadSeed = await fillLeadForm(page, app);

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads/);
    await assertLeadCreated(page, leadSeed.fullName, leadSeed.projectName);

    await openLeadByName(page, leadSeed.fullName);

    await moveLeadThroughStages(page, [
      { stage: "Site Visit", remark: "Stage moved to Site Visit for test flow." }
    ]);

    await assertLeadJourneyStages(page, [
      "New Lead",
      "Site Visit"
    ]);
  });
});
