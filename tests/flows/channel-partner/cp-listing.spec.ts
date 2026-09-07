import { expect, test } from "../../support/test";
import {
  expectChannelPartnerListFilteredByStage,
  expectChannelPartnerListVisible,
  goToChannelPartnerListing,
  selectChannelPartnerTab,
} from "../../support/channel-partners";

test.describe("Channel Partner listing flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 120000));

  test("Render All, Unregistered, and Registered CP lists", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    await expect(page.getByRole("tab", { name: /^All CP'?s?(?:\s+\d+)?$/i })).toBeVisible();
    await expectChannelPartnerListVisible(page);

    await selectChannelPartnerTab(page, "Unregistered");
    await expectChannelPartnerListFilteredByStage(page, "Unregistered");

    await selectChannelPartnerTab(page, "Registered");
    await expectChannelPartnerListFilteredByStage(page, "Registered");
  });
});
