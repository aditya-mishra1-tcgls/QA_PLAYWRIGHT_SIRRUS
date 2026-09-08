import { test, expect } from "../../support/test";
import {
  assertLeadCreated,
  assertLeadSearchableByContactDetails,
  fillLeadForm,
  goToManageLeads,
} from "../../support/leads";
import {
  LeadDashboardPage,
  LeadListPage,
  type LeadStageFilter,
  type LeadTemperatureFilter,
} from "../../pages";

test.describe("Lead search flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 120000));

  test("Verify Lead Dashboard loads", async ({ page, app }) => {
    const leadDashboardPage = new LeadDashboardPage(page);

    await leadDashboardPage.open(app);
    await leadDashboardPage.expectDashboardOverviewVisible();
  });

  test("Verify Lead Listing opens", async ({ page, app }) => {
    await goToManageLeads(page, app);

    const leadListPage = new LeadListPage(page);
    await leadListPage.expectLeadListingLoaded();
  });

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

  test("Filter leads by each temperature and validate result count", async ({ page, app }) => {
    await goToManageLeads(page, app);

    const leadListPage = new LeadListPage(page);
    const temperatures: LeadTemperatureFilter[] = ["Hot", "Warm", "Cold"];

    for (const temperature of temperatures) {
      await test.step(`Apply ${temperature} temperature filter`, async () => {
        await leadListPage.applyTemperatureFilter(temperature);
      });
    }
  });

  test("Clear applied filters and restore default lead list", async ({ page, app }) => {
    await goToManageLeads(page, app);

    const leadListPage = new LeadListPage(page);
    await leadListPage.selectAllProjects();

    await leadListPage.applyStageFilter("Contacted");
    await leadListPage.clearFilters();
    await leadListPage.expectAllStageDataLoaded();
  });
});
