import { test, expect } from "../../support/test";
import { addRemarkToOpenedLead, openAnyLeadFromListing } from "../../support/leads";

test.describe("Lead remark flow", () => {
  test.setTimeout(90000);

  test("user should add a remark on any existing lead and save it", async ({ page, app }) => {
    await openAnyLeadFromListing(page, app);

    const addedRemark = await addRemarkToOpenedLead(page, "Helloe new test remark from automation");

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads\/?\?id=/);
    await expect(page.locator("body")).toContainText(addedRemark.text);
  });
});
