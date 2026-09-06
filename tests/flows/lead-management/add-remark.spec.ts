import { test, expect } from "../../support/test";
import { addRemarkToOpenedLead, openAnyLeadFromListing } from "../../support/leads";

test.describe("Lead remark flow", () => {
  test.setTimeout(90000);

  test("Add remark to existing lead activity", async ({ page, app }) => {
    await openAnyLeadFromListing(page, app);

    const addedRemark = await addRemarkToOpenedLead(page, "Helloe new test remark from automation");

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads\/?\?id=/);
    await expect(page.locator("body")).toContainText(addedRemark.text);
  });
});
