import { test, expect } from "../../support/test";
import type { Page } from "@playwright/test";
import {
  assertLeadJourneyStages,
  assertLeadCreated,
  assertScheduledSiteVisitReady,
  assertSiteVisitStageCasesOnOpenedLead,
  completeOpenedSiteVisitWithOtp,
  completeOpenedSiteVisitWithSkip,
  fillLeadForm,
  goToManageLeads,
  markOpenedSiteVisitNoShow,
  moveCompletedSiteVisitToOpportunity,
  moveOpenedLeadToSiteVisitInProgress,
  openLeadByName
} from "../../support/leads";
import {
  assertSiteVisitHistory
} from "../../support/site-visit";

type AppConfig = {
  envName: string;
  baseUrl: string;
  activeProjectName: string;
};

test.describe("Site visit lifecycle flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 220000));

  async function createScheduledSiteVisitLead(page: Page, app: AppConfig) {
    await goToManageLeads(page, app);

    const leadSeed = await fillLeadForm(page, app);

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads/);
    await assertLeadCreated(page, leadSeed.fullName, leadSeed.projectName);

    await openLeadByName(page, leadSeed.fullName);
    await assertSiteVisitStageCasesOnOpenedLead(page);
    await assertScheduledSiteVisitReady(page, leadSeed.fullName);

    return leadSeed;
  }

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
    await assertScheduledSiteVisitReady(page, leadSeed.fullName);
    await assertLeadJourneyStages(page, ["New Lead", "Site Visit", "Scheduled"]);
    await moveOpenedLeadToSiteVisitInProgress(page, leadSeed.fullName);
  });

  test("site visit should complete with hard-coded OTP 1234", async ({ page, app }) => {
    const leadSeed = await createScheduledSiteVisitLead(page, app);

    await moveOpenedLeadToSiteVisitInProgress(page, leadSeed.fullName);
    await completeOpenedSiteVisitWithOtp(page, leadSeed.fullName);
  });

  test("site visit should complete through skip OTP path", async ({ page, app }) => {
    const leadSeed = await createScheduledSiteVisitLead(page, app);

    await moveOpenedLeadToSiteVisitInProgress(page, leadSeed.fullName, "skip");
    await completeOpenedSiteVisitWithSkip(page, leadSeed.fullName);
  });

  test("site visit should support no show outcome", async ({ page, app }) => {
    const leadSeed = await createScheduledSiteVisitLead(page, app);

    await markOpenedSiteVisitNoShow(page, leadSeed.fullName);
  });

  test("site visit done lead should move to opportunity with remark and next follow up date", async ({ page, app }) => {
    const leadSeed = await createScheduledSiteVisitLead(page, app);

    await moveOpenedLeadToSiteVisitInProgress(page, leadSeed.fullName);
    await completeOpenedSiteVisitWithOtp(page, leadSeed.fullName);
    await moveCompletedSiteVisitToOpportunity(page, leadSeed.fullName);
  });
});
