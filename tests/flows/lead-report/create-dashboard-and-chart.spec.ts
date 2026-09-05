import { expect, test } from "../../support/test";
import { createLeadReportDashboardAndChart } from "../../support/reports";

test.describe("Lead report dashboard flow", () => {
  test.setTimeout(180000);

  test("user should create a dashboard and chart from reports dashboard", async ({ page, app }) => {
    const createdAssets = await createLeadReportDashboardAndChart(page, app);

    expect(createdAssets.dashboardDeleted).toBe(true);
    await expect(page.getByRole("tab", { name: new RegExp(createdAssets.dashboardName, "i") })).toHaveCount(0);
  });
});
