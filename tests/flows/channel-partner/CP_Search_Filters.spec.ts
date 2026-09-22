import { test } from "../../support/test";
import { ChannelPartnerPage } from "../../pages";
import {
  buildChannelPartnerSeed,
  createChannelPartner,
  goToChannelPartnerListing,
} from "../../support/channel-partners";

test.describe("Channel Partner search and filter flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 180000));

  test("Verify clicking each stage card filters the list correctly", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.expectEachStageCardFiltersListCorrectly();
  });

  test("Verify Filter control opens applicable filter options", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.expectFilterControlOpensApplicableOptions();
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

  test("Verify single filter application works correctly", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.applySingleAvailableFilterAndVerify();
  });

  test("Verify multiple filters can be combined", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.applyMultipleAvailableFiltersAndVerify();
  });

  test("Verify filter reset clear restores default listing", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.clearFiltersAndExpectDefaultListingRestored();
  });

  test("Verify table headers map correctly to displayed data", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.expectTableHeadersMapToDisplayedCpData();
  });

  test("Verify stage value displayed in table matches stage summary and detail record", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.expectStageValueMatchesSummaryAndDetailRecord();
  });

  test("Verify Assigned column displays correct user", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.expectAssignedColumnMatchesDetailRecord();
  });

  test("Verify records can be filtered or sorted correctly by date-related fields if supported", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.expectDateRelatedFilterOrSortWorksIfSupported();
  });

  test("Verify repeated search filter and navigation actions do not break listing state", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.expectRepeatedSearchFilterAndNavigationKeepListingStable();
  });
});
