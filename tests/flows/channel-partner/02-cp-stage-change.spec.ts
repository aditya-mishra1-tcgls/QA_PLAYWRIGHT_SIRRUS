import { test } from "../../support/test";
import {
  changeChannelPartnerStage,
  createChannelPartner,
  openChannelPartnerByContactName,
} from "../../support/channel-partners";

test.describe("Channel Partner stage change flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 150000));

  test("Create a Channel Partner and move it to Follow Up", async ({
    page,
    app,
  }) => {
    const channelPartner = await createChannelPartner(page, app);

    await openChannelPartnerByContactName(page, channelPartner);
    await changeChannelPartnerStage(page, "Follow Up");
  });
});
