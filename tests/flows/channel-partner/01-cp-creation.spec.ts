import { expect, test } from "../../support/test";
import {
  assertChannelPartnerCreated,
  createChannelPartner,
  goToChannelPartnerListing,
} from "../../support/channel-partners";

test.describe("Channel Partner creation flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 120000));

  test("Create a Channel Partner and verify it through listing search", async ({
    page,
    app,
  }) => {
    const channelPartner = await createChannelPartner(page, app);

    await expect(page).toHaveURL(/channel-partners\/channel-partner-qualification/);
    await goToChannelPartnerListing(page, app);
    await assertChannelPartnerCreated(page, channelPartner);
  });
});
