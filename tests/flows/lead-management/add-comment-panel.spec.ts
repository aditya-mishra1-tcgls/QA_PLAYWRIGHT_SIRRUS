import { test, expect } from "../../support/test";
import {
  assertAddCommentPanelOnOpenedLead,
  openAnyLeadFromListing,
} from "../../support/leads";

test.describe("Lead comment flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 90000));

  test("Open add comment panel for existing lead", async ({ page, app }) => {
    await openAnyLeadFromListing(page, app);

    const result = await assertAddCommentPanelOnOpenedLead(page);

    await expect(page).toHaveURL(
      /engagement-intelligence\/manage-leads\/?\?id=/,
    );
    await expect(page.locator("body")).toContainText(result.panelTitle);
  });
});
