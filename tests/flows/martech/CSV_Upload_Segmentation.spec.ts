import path from "node:path";
import { existsSync } from "node:fs";
import { expect, test } from "../../support/test";
import { MartechSegmentsPage } from "../../pages";

function randomSegmentName() {
  return `SegPhone${Date.now().toString().slice(-4)}`;
}

function phoneSegmentCsvPath() {
  const preferredPath =
    process.env.MARTECH_PHONE_SEGMENT_CSV_PATH ||
    "/Users/sunilsabat/Downloads/TestData/Test_Phone_Segment.csv";
  return existsSync(preferredPath)
    ? preferredPath
    : path.resolve("tests/data/martech/Test_Phone_Segment.csv");
}

test.describe("CSV upload segmentation flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 300000));

  test("Manual add segment functionality using CSV file for phone", async ({ page, app }) => {
    const martechSegmentsPage = new MartechSegmentsPage(page);
    const segmentName = randomSegmentName();
    const csvPath = phoneSegmentCsvPath();

    await martechSegmentsPage.openActiveLeadCampaigns(app);
    await martechSegmentsPage.createPhoneSegmentFromCsv(segmentName, csvPath);
    await martechSegmentsPage.openCreatedSegmentDetails(segmentName);

    await expect(page.locator("body")).toContainText(new RegExp(segmentName));
  });
});
