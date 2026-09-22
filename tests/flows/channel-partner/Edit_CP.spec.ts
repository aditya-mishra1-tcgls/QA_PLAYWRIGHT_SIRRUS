import { test } from "../../support/test";
import { ChannelPartnerPage } from "../../pages";
import {
  buildChannelPartnerSeed,
  createChannelPartner,
  goToChannelPartnerListing,
} from "../../support/channel-partners";

test.describe("Channel Partner edit flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 240000));

  test("To verify editing mandatory fields of existing CP creates a new CP", async ({
    page,
    app,
  }) => {
    const channelPartner = await createChannelPartner(page, app, buildChannelPartnerSeed(app));
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.searchAndExpectRecord(channelPartner.fullName, [channelPartner.fullName]);
    const listingRecord = await channelPartnerPage.captureFirstVisibleListingRecord();

    await channelPartnerPage.openListingRecordDetails(listingRecord);
    await channelPartnerPage.editCurrentCpMandatoryDataAndVerifyNewCpCreated(app);
  });

  test("Verify CP can be editable with valid mandatory data", async ({
    page,
    app,
  }) => {
    const channelPartner = await createChannelPartner(page, app, buildChannelPartnerSeed(app));
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.searchAndExpectRecord(channelPartner.fullName, [channelPartner.fullName]);
    const listingRecord = await channelPartnerPage.captureFirstVisibleListingRecord();

    await channelPartnerPage.openListingRecordDetails(listingRecord);
    await channelPartnerPage.expectEditCpMandatoryValidationMessages();
  });
});
