import { expect, test } from "../../support/test";
import {
  assertChannelPartnerCreated,
  buildChannelPartnerSeed,
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

  test("Search created Channel Partner using CP name, CP ID, legal entity, casing, and invalid keyword", async ({
    page,
    app,
  }) => {
    const channelPartnerSeed = buildChannelPartnerSeed(app);
    const cpSearchValue = `Automation CP ${Date.now().toString(36).replace(/\d/g, "A").toUpperCase()}`;
    channelPartnerSeed.companyName = cpSearchValue;
    channelPartnerSeed.fullName = cpSearchValue;

    const channelPartner = await createChannelPartner(page, app, channelPartnerSeed);
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);

    await test.step("Verify search returns matching CP records by CP Name", async () => {
      await channelPartnerPage.searchAndExpectRecord(channelPartner.fullName, [channelPartner.fullName]);
      await channelPartnerPage.searchAndExpectRecord(channelPartner.fullName.slice(0, 8), [channelPartner.fullName]);
    });

    const cpId = await test.step("Verify search works with CP ID", async () => {
      const capturedCpId = await channelPartnerPage.captureCpIdForRecord(channelPartner.fullName);
      await channelPartnerPage.searchAndExpectRecord(capturedCpId, [capturedCpId, channelPartner.fullName]);
      return capturedCpId;
    });

    await test.step("Verify search works with legal entity name", async () => {
      await channelPartnerPage.searchAndExpectRecord(channelPartner.companyName, [channelPartner.companyName]);
      await channelPartnerPage.searchAndExpectRecord(channelPartner.companyName.slice(0, 8), [channelPartner.companyName]);
    });

    await test.step("Verify search is case-insensitive and trims leading/trailing spaces", async () => {
      await channelPartnerPage.searchAndExpectRecord(`  ${channelPartner.fullName.toUpperCase()}  `, [channelPartner.fullName]);
      await channelPartnerPage.searchAndExpectRecord(channelPartner.fullName.toLowerCase(), [channelPartner.fullName]);
      await channelPartnerPage.searchAndExpectRecord(cpId.toLowerCase(), [cpId, channelPartner.fullName]);
    });

    await test.step("Verify invalid keyword search shows no matching records gracefully", async () => {
      await channelPartnerPage.searchAndExpectNoRecords(`NO_CP_${Date.now()}`);
    });
  });

  test("Verify clicking CP Name opens corresponding CP details page", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    const listingRecord = await channelPartnerPage.captureFirstVisibleListingRecord();

    await channelPartnerPage.openListingRecordDetails(listingRecord);
    await channelPartnerPage.expectDetailsMatchListingRecord(listingRecord);
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
