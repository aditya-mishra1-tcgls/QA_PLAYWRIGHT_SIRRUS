import { expect, test } from "../../support/test";
import { ReportsPage } from "../../pages";
import { createLeadReportDashboardAndChart } from "../../support/reports";

test.describe("Dashboard report flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 180000));

  test("Create lead report dashboard with source chart", async ({
    page,
    app,
  }) => {
    const createdAssets = await createLeadReportDashboardAndChart(page, app);

    expect(createdAssets.dashboardDeleted).toBe(true);
    await expect(
      page.getByRole("tab", {
        name: new RegExp(createdAssets.dashboardName, "i"),
      }),
    ).toHaveCount(0);
  });

  test("Verify existing dashboards are listed", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const dashboardNames = await reportsPage.expectExistingDashboardsListed([
      "prachi's",
      "Inv",
      "Postsale_dashboards",
      "Sandeep Test Dash",
    ]);

    expect(dashboardNames.length).toBeGreaterThan(0);
  });

  test("Verify left navigation highlights Reports & Dashboard", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    await reportsPage.expectReportsNavigationIsActive();
  });

  test("Verify selecting a dashboard loads its widgets", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const selectedDashboard = await reportsPage.expectSelectingDashboardLoadsWidgets();

    expect(selectedDashboard.widgets.length).toBeGreaterThan(0);
  });

  test("Verify Edit action is available for each dashboard", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const editedDashboard = await reportsPage.expectEditActionAvailableForListedDashboard();

    expect(editedDashboard).toBeTruthy();
  });

  test("Verify selected dashboard state is retained visually", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const selectedDashboard = await reportsPage.expectSelectedDashboardStateRetainedVisually();

    expect(selectedDashboard).toBeTruthy();
  });

  test("Verify each widget shows title and last updated date", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const widgets = await reportsPage.expectWidgetCardsShowTitleAndLastUpdated();

    expect(widgets.length).toBeGreaterThan(0);
  });

  test("Verify mixed widget types can coexist on same dashboard", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const widgets = await reportsPage.expectMixedWidgetTypesRenderWithoutLayoutBreak();

    expect(widgets.length).toBeGreaterThan(0);
  });

  test("Verify duplicate or similar widget names do not conflict", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const checkedWidgets = await reportsPage.expectSimilarWidgetNamesKeepSeparateActions();

    expect(Array.isArray(checkedWidgets)).toBe(true);
  });

  test("Verify date formatting consistency across widgets", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const widgets = await reportsPage.expectWidgetDateFormattingConsistency();

    expect(widgets.length).toBeGreaterThan(0);
  });

  test("Verify browser refresh preserves accessible state", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const refreshState = await reportsPage.expectRefreshPreservesDashboardAccess();

    expect(refreshState.dashboardsAfterRefresh.length).toBeGreaterThan(0);
    expect(refreshState.widgetsAfterRefresh.length).toBeGreaterThan(0);
  });

  test("Verify widget download options are available", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const checkedWidgets = await reportsPage.expectWidgetDownloadOptionsAvailable();

    expect(checkedWidgets.length).toBeGreaterThan(0);
  });

  test("Verify widget actions menu opens correctly", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const checkedWidgets = await reportsPage.expectWidgetActionsMenuOpensCorrectly();

    expect(checkedWidgets.length).toBeGreaterThan(0);
  });

  test("Verify table widgets render headers and rows correctly", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const tableWidgets = await reportsPage.expectTableWidgetsRenderHeadersAndRows();

    expect(tableWidgets.length).toBeGreaterThan(0);
  });

  test("Verify grand total row calculation is displayed in table widgets", async ({ page, app }) => {
    const reportsPage = new ReportsPage(page);

    await reportsPage.open(app);
    const widgetsWithGrandTotal = await reportsPage.expectGrandTotalRowsDisplayedWhenAvailable();

    expect(Array.isArray(widgetsWithGrandTotal)).toBe(true);
  });
});
