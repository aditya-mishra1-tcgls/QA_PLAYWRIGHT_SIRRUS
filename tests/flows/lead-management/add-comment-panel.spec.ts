import { test, expect } from "../../support/test";
import { assertAddCommentPanelOnOpenedLead, openAnyLeadFromListing } from "../../support/leads";

test.describe("Lead comment flow", () => {
  test.setTimeout(90000);

  test("user should open add comment on any existing lead and verify the panel rendering", async ({ page, app }) => {
    await openAnyLeadFromListing(page, app);

    const result = await assertAddCommentPanelOnOpenedLead(page);

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads\/?\?id=/);
    await expect(page.locator("body")).toContainText(result.panelTitle);
  });
});
