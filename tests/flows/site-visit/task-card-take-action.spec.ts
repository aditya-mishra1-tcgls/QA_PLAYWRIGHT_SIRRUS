import { test, expect } from "../../support/test";
import {
  assertLeadCreated,
  assertLeadJourneyStages,
  cancelSiteVisitFromOpenedLead,
  fillLeadForm,
  goToManageLeads,
  moveLeadThroughStages,
  openLeadByName,
  openLeadTaskFromDashboard
} from "../../support/leads";

test.describe("Site visit task card action flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 180000));

  test("Cancel site visit from dashboard task card", async ({ page, app }) => {
    let leadName = "";

    await test.step("Create lead for site visit task", async () => {
      await goToManageLeads(page, app);

      const leadSeed = await fillLeadForm(page, app);
      leadName = leadSeed.fullName;

      await expect(page).toHaveURL(/engagement-intelligence\/manage-leads/);
      await assertLeadCreated(page, leadSeed.fullName, leadSeed.projectName);
    });

    await test.step("Move lead to Site Visit stage", async () => {
      await openLeadByName(page, leadName);
      await moveLeadThroughStages(page, [
        { stage: "Site Visit", remark: "Stage moved to Site Visit for dashboard task action flow." }
      ]);
      await assertLeadJourneyStages(page, ["New Lead", "Site Visit"]);
    });

    await test.step("Open lead from AI-prioritized task card", async () => {
      await openLeadTaskFromDashboard(page, app, leadName);
      await expect(page.locator("body")).toContainText(leadName, { timeout: 60000 });
    });

    await test.step("Cancel site visit with automation reason", async () => {
      await cancelSiteVisitFromOpenedLead(page, "automation is done", "Out of Town");
      await assertLeadJourneyStages(page, ["Cancelled"]);
    });
  });
});
