import { test, expect } from "../../support/test";
import {
  assertAddCommentPanelOnOpenedLead,
  assignLeadFromListingToAvailableUser,
  openAnyLeadFromListing,
  openLeadWhatsAppIntegrationFromListing,
  saveCommentWithRecordingOnOpenedLead,
} from "../../support/leads";

const recordingFilePath = "/Users/sunilsabat/Downloads/1783678014398.mp3";

test.describe("Lead comment flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 90000));

  test("Comments section displays follow-up site visit remarks and attachment options", async ({ page, app }) => {
    await openAnyLeadFromListing(page, app);

    const result = await assertAddCommentPanelOnOpenedLead(page);

    await expect(page).toHaveURL(
      /engagement-intelligence\/manage-leads\/?\?id=/,
    );
    await expect(page.locator("body")).toContainText(result.panelTitle);
  });

  test("Admin assigns selected lead to available sales user", async ({ page, app }) => {
    const assignment = await assignLeadFromListingToAvailableUser(page, app);

    await expect(page.locator("body")).toContainText(assignment.assignee);
  });

  test("WhatsApp icon opens lead chat integration", async ({ page, app }) => {
    const result = await openLeadWhatsAppIntegrationFromListing(page, app);

    expect(result.openedIn).toMatch(/popup|current-page/);
    expect(result.target).toBeTruthy();
  });

  test("Comments section saves follow-up recording remark and reflects in overview and journey", async ({ page, app }, testInfo) => {
    testInfo.setTimeout(180000);

    await openAnyLeadFromListing(page, app);

    const result = await saveCommentWithRecordingOnOpenedLead(page, recordingFilePath);

    await expect(page.locator("body")).toContainText(new RegExp(result.remark));
  });
});
