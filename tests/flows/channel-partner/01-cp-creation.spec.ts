import { expect, test } from "../../support/test";
import {
  assertChannelPartnerCreated,
  createChannelPartner,
  goToChannelPartnerListing,
} from "../../support/channel-partners";
import { ChannelPartnerPage } from "../../pages";

test.describe("Channel Partner creation flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 180000));

  test("Create a Channel Partner and verify it through listing search", async ({
    page,
    app,
  }) => {
    const channelPartner = await createChannelPartner(page, app);

    await expect(page).toHaveURL(/channel-partners\/channel-partner-qualification/);
    await goToChannelPartnerListing(page, app);
    await assertChannelPartnerCreated(page, channelPartner);
  });

  test("Verify presence of core controls on CP Listing page", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.expectCoreListingControlsVisible();
  });

  test("Verify stage summary cards are visible and populated", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.expectStageSummaryCardsVisibleAndPopulated();
  });

  test("Verify SV Date & Time and Follow Up Date & Time formatting", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.expectSvAndFollowUpDateTimeFormatting();
  });

  test("Verify selected CP details page shows correct record information", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    const listingRecord = await channelPartnerPage.captureFirstVisibleListingRecord();

    await channelPartnerPage.openListingRecordDetails(listingRecord);
    await channelPartnerPage.expectDetailsMatchListingRecord(listingRecord);
  });
});
