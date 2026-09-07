import { test, expect } from "../../support/test";
import { assertGenerateCostSheetRenderingOnOpenedLead, openAnyLeadFromListing } from "../../support/leads";

test.describe("Lead quotation flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 90000));

  test("Open generated cost sheet preview for lead", async ({ page, app }) => {
    await openAnyLeadFromListing(page, app);

    const result = await assertGenerateCostSheetRenderingOnOpenedLead(page);

    await expect(page).toHaveURL(/projects\/cost-sheet\?projectId=.*fromquotations=true/i);
    await expect(page.locator("body")).toContainText(result.emptyStateText);
  });
});
