import { test } from "../../support/test";
import { LeadReportsPage } from "../../pages";

test.describe("Lead reports flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 180000));

  test("Open Lead Reports tab", async ({ page, app }) => {
    const leadReportsPage = new LeadReportsPage(page);

    await leadReportsPage.open(app);
    await leadReportsPage.selectAllProjects();
    await leadReportsPage.expectReportsLoaded();
  });

  test("Filter reports by date range and export report data", async ({ page, app }) => {
    const leadReportsPage = new LeadReportsPage(page);

    await leadReportsPage.open(app);
    await leadReportsPage.selectAllProjects();
    await leadReportsPage.applyCustomDateRangeOnReport(1);
    await leadReportsPage.expectReportDataVisibleAfterDateFilter("Executive wise Site Visit");

    const reportDownload = await leadReportsPage.downloadVisibleReportPdf(1);
    await leadReportsPage.expectPdfDownload(reportDownload);
  });
});
