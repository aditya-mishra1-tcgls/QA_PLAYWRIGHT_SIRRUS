import { test, expect } from "../../support/test";
import {
  assertLeadCreated,
  assertLeadSearchableByContactDetails,
  fillLeadForm,
  goToManageLeads,
} from "../../support/leads";
import { LeadListPage, type LeadStageFilter } from "../../pages";

test.describe("Lead search flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 120000));

  test("Create lead and search by name, phone number, and email", async ({ page, app }) => {
    await goToManageLeads(page, app);

    const leadSeed = await fillLeadForm(page, app);

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads/);
    await assertLeadCreated(page, leadSeed.fullName, leadSeed.projectName);
    await assertLeadSearchableByContactDetails(page, leadSeed);
  });

  test("Apply status, source, and project filters together", async ({ page, app }) => {
    await goToManageLeads(page, app);

    const leadListPage = new LeadListPage(page);
    await leadListPage.selectAllProjects();

    const criteria = {
      stage: "New Lead" as LeadStageFilter,
      source: "Digital Marketing",
      projectName: "All Projects",
    };

    await leadListPage.applyFilters(criteria);
    await leadListPage.expectFilteredResults(criteria);
  });

  test("Filter leads by each single status", async ({ page, app }) => {
    await goToManageLeads(page, app);

    const leadListPage = new LeadListPage(page);
    await leadListPage.selectAllProjects();

    const statuses: LeadStageFilter[] = [
      "Open",
      "Qualified",
      "Site Visit",
      "Opportunity",
      "Booked",
      "Dropped",
    ];

    for (const status of statuses) {
      await test.step(`Apply ${status} status filter`, async () => {
        const criteria = { stage: status };
        await leadListPage.applyFilters(criteria);
        await leadListPage.expectFilteredResults(criteria);
        await leadListPage.clearFilters();
      });
    }
  });
});
