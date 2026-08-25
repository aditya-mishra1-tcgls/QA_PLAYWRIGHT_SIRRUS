import { test, expect } from "../../support/test";
import {
  assertLeadCreated,
  editOpenedLeadName,
  fillLeadForm,
  goToManageLeads,
  moveOpenedLeadToSiteVisitInProgress,
  openLeadByName
} from "../../support/leads";

test.describe("Lead create and edit flow", () => {
  test.setTimeout(120000);

  test("user should create a lead and then edit the same lead", async ({ page, app }) => {
    await goToManageLeads(page, app);

    const leadSeed = await fillLeadForm(page, app);

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads/);
    await assertLeadCreated(page, leadSeed.fullName, leadSeed.projectName);

    await openLeadByName(page, leadSeed.fullName);
    const editedLead = await editOpenedLeadName(page, "test flow");
    await moveOpenedLeadToSiteVisitInProgress(page);

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads\?id=/);
    await expect(page.locator("body")).toContainText(editedLead.updatedName);
    await expect(page.locator("body")).toContainText(/In Progress/i);
  });
});
