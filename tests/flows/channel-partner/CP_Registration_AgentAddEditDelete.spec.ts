import { test } from "../../support/test";
import { ChannelPartnerPage } from "../../pages";
import { goToChannelPartnerListing } from "../../support/channel-partners";

test.describe("Channel Partner registration agent flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 240000));

  test("Verify add Agent in the CP", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.registerUnregisteredCpAndVerifyAgentAdded();
  });

  test("Verify multiple Agent in the CP", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.registerUnregisteredCpAndVerifyMultipleAgentsAdded();
  });

  test("Verify delete Agent in the CP", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.registerUnregisteredCpAndVerifyAgentDeleted();
  });

  test("Verify edit Agent in the CP", async ({
    page,
    app,
  }) => {
    await goToChannelPartnerListing(page, app);

    const channelPartnerPage = new ChannelPartnerPage(page);
    await channelPartnerPage.registerUnregisteredCpAndVerifyAgentEdited();
  });
});
