import { test, expect } from "../../support/test";
import { editOpenedLeadName, openAnyLeadFromListing } from "../../support/leads";

test.describe("Lead edit flow", () => {
  test.setTimeout(90000);

  test("user should edit any existing lead, update name and email, and save the changes", async ({ page, app }) => {
    await openAnyLeadFromListing(page, app);

    const editedLead = await editOpenedLeadName(page);

    await expect(page).toHaveURL(/engagement-intelligence\/manage-leads\?id=/);
    await expect(page.locator("body")).toContainText(editedLead.updatedEmail);
    await expect(page.locator("body")).toContainText(editedLead.updatedName.slice(0, 24));
  });
});
