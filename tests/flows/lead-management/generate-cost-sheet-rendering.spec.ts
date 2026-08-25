import { test, expect } from "../../support/test";
import { assertGenerateCostSheetRenderingOnOpenedLead, openAnyLeadFromListing } from "../../support/leads";

test.describe("Lead quotation flow", () => {
  test.setTimeout(90000);

  test("user should open generate cost sheet on any lead and verify the rendering state", async ({ page, app }) => {
    await openAnyLeadFromListing(page, app);

    const result = await assertGenerateCostSheetRenderingOnOpenedLead(page);

    await expect(page).toHaveURL(/projects\/cost-sheet\?projectId=.*fromquotations=true/i);
    await expect(page.locator("body")).toContainText(result.emptyStateText);
  });
});
