import path from "node:path";
import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../../support/test";
import { MartechSegmentsPage, type OneTimeCampaignChannel } from "../../pages";

function uniqueName(prefix: string) {
  return `${prefix}${Date.now().toString().slice(-6)}`;
}

function phoneSegmentCsvPath() {
  const preferredPath =
    process.env.MARTECH_PHONE_SEGMENT_CSV_PATH ||
    "/Users/sunilsabat/Downloads/TestData/Test_Phone_Segment.csv";
  return existsSync(preferredPath)
    ? preferredPath
    : path.resolve("tests/data/martech/Test_Phone_Segment.csv");
}

async function fitMartechPageToViewport(page: Page) {
  await page.addStyleTag({
    content: `
      html,
      body,
      #root {
        zoom: 0.86;
      }
    `,
  }).catch(() => {});
}

async function useBusinessHoursClock(page: Page) {
  await page.addInitScript(() => {
    const RealDate = Date;
    const businessHourDate = new RealDate();
    businessHourDate.setHours(10, 30, 0, 0);

    class BusinessHoursDate extends RealDate {
      constructor(
        value?: string | number | Date,
        monthIndex?: number,
        date?: number,
        hours?: number,
        minutes?: number,
        seconds?: number,
        ms?: number,
      ) {
        if (arguments.length === 0) {
          super(businessHourDate.getTime());
        } else if (arguments.length === 1) {
          super(value as string | number | Date);
        } else {
          super(
            value as number,
            monthIndex as number,
            date,
            hours,
            minutes,
            seconds,
            ms,
          );
        }
      }

      static now() {
        return businessHourDate.getTime();
      }
    }

    BusinessHoursDate.UTC = RealDate.UTC;
    BusinessHoursDate.parse = RealDate.parse;
    BusinessHoursDate.prototype = RealDate.prototype;
    window.Date = BusinessHoursDate as DateConstructor;
  });
}

async function createPhoneSegmentAndPublishCampaign(
  pageObject: MartechSegmentsPage,
  channel: OneTimeCampaignChannel,
  csvPath: string,
) {
  const segmentName = uniqueName(`${channel.replace(/\s+/g, "")}Seg`);
  const campaignName = uniqueName(`${channel.replace(/\s+/g, "")}Campaign`);

  await pageObject.createPhoneSegmentFromCsv(segmentName, csvPath);
  await pageObject.openCreatedSegmentDetails(segmentName);
  await pageObject.createAndPublishSendNowCampaign(channel, campaignName);

  return { campaignName, segmentName };
}

test.describe("One Time Campaign flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 420000));
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page, app }) => {
    await useBusinessHoursClock(page);
    const martechSegmentsPage = new MartechSegmentsPage(page);
    await martechSegmentsPage.openActiveLeadCampaigns(app);
    await fitMartechPageToViewport(page);
  });

  test("Create and publish Send Now SMS campaign using a phone segment", async ({ page }) => {
    const martechSegmentsPage = new MartechSegmentsPage(page);
    const { campaignName } = await createPhoneSegmentAndPublishCampaign(
      martechSegmentsPage,
      "SMS",
      phoneSegmentCsvPath(),
    );

    await expect(page.getByText(new RegExp(`^${campaignName}$`, "i")).first()).toBeVisible();
  });

  test("Create and publish Send Now WhatsApp campaign using a phone segment", async ({ page }) => {
    const martechSegmentsPage = new MartechSegmentsPage(page);
    const { campaignName } = await createPhoneSegmentAndPublishCampaign(
      martechSegmentsPage,
      "WhatsApp",
      phoneSegmentCsvPath(),
    );

    await expect(page.getByText(new RegExp(`^${campaignName}$`, "i")).first()).toBeVisible();
  });

  test("Publish RCS campaign using a phone segment", async ({ page }) => {
    const martechSegmentsPage = new MartechSegmentsPage(page);
    const { campaignName } = await createPhoneSegmentAndPublishCampaign(
      martechSegmentsPage,
      "RCS",
      phoneSegmentCsvPath(),
    );

    await expect(page.getByText(new RegExp(`^${campaignName}$`, "i")).first()).toBeVisible();
  });

  test("Publish AI Calling campaign using phone segment", async ({ page }) => {
    const martechSegmentsPage = new MartechSegmentsPage(page);
    const campaignName = uniqueName("AICallCampaign");

    await martechSegmentsPage.createAndPublishAiCallingCampaign(campaignName);

    await expect(page.getByText(new RegExp(`^${campaignName}$`, "i")).first()).toBeVisible();
  });

  test("Verify listing page performance matrix analytics and preview page for SMS one time campaign", async ({ page }) => {
    const martechSegmentsPage = new MartechSegmentsPage(page);
    const { campaignName } = await createPhoneSegmentAndPublishCampaign(
      martechSegmentsPage,
      "SMS",
      phoneSegmentCsvPath(),
    );

    await martechSegmentsPage.verifySmsCampaignListingPerformanceMatrix(campaignName);

    const campaignAnalyticsPage = await martechSegmentsPage.openCampaignAnalyticsPage(campaignName);
    await martechSegmentsPage.verifySmsCampaignAnalyticsAndPreview(campaignAnalyticsPage, campaignName);
  });
});
