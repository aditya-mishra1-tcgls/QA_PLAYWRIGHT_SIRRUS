import { test, expect } from "../../support/test";
import {
  addReEnquiryToOpenedLead,
  openAnyLeadFromListing,
} from "../../support/leads";

test.describe("Lead re-enquiry flow", () => {
  test.setTimeout(90000);

  test("Add Direct Site Visit walk-in re-enquiry", async ({ page, app }) => {
    await openAnyLeadFromListing(page, app);

    const result = await addReEnquiryToOpenedLead(
      page,
      "Direct Site Visit",
      "Walk In",
    );

    await expect(page).toHaveURL(
      /engagement-intelligence\/manage-leads\/?\?id=/,
    );
    await expect(page.locator("body")).toContainText(result.source);
  });
});
