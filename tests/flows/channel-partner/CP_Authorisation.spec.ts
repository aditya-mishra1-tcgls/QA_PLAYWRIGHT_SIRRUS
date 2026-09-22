import { test } from "../../support/test";
import { ChannelPartnerPage } from "../../pages";
import { getUnauthorizedChannelPartnerUser } from "../../support/non-admin-users";

test.describe("Channel Partner authorisation flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 180000));

  test("Verify unauthorized or restricted user cannot access CP Listing page", async ({
    page,
    app,
  }) => {
    const unauthorizedUser = getUnauthorizedChannelPartnerUser(app.envName);
    const channelPartnerPage = new ChannelPartnerPage(page);

    await channelPartnerPage.expectUnauthorizedUserCannotAccessCpListing(app, unauthorizedUser);
  });
});
