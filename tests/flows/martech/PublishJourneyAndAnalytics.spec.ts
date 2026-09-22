import path from "node:path";
import { existsSync } from "node:fs";
import { test } from "../../support/test";
import { MartechJourneyPage, MartechSegmentsPage, ProjectSwitcherPage } from "../../pages";

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

test.describe("Publish Journey and Analytics flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 420000));
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page, app }) => {
    const martechSegmentsPage = new MartechSegmentsPage(page);
    await martechSegmentsPage.openActiveLeadCampaigns(app);
  });

  test("To Publish Segment based Journey for SMS channels", async ({ page }) => {
    const journeyPage = new MartechJourneyPage(page);
    const journeyName = uniqueName("SMSJourney");
    const segmentName = uniqueName("SegmentPhone");

    await journeyPage.createAndPublishSmsSegmentJourney(journeyName, segmentName, phoneSegmentCsvPath());
  });

  test("To Publish Segment based Journey for WhatsApp channels", async ({ page }) => {
    const journeyPage = new MartechJourneyPage(page);
    const journeyName = uniqueName("WhatsAppJourney");
    const segmentName = uniqueName("SegmentPhone");

    await journeyPage.createAndPublishSegmentJourney("WhatsApp", journeyName, segmentName, phoneSegmentCsvPath());
  });

  test("To Publish Segment based Journey for AI Calling channels", async ({ page, app }) => {
    const martechSegmentsPage = new MartechSegmentsPage(page);
    await new ProjectSwitcherPage(page).ensureActiveProject(
      process.env.MARTECH_AI_CALLING_PROJECT_NAME || "Parth lakefront",
    );
    await martechSegmentsPage.openActiveLeadCampaigns(app);

    const journeyPage = new MartechJourneyPage(page);
    const journeyName = uniqueName("AIJourney");
    const segmentName = uniqueName("SegmentPhone");

    await journeyPage.createAndPublishSegmentJourney("AI Calling", journeyName, segmentName, phoneSegmentCsvPath());
  });

  test("To Publish Event based Journey for SMS channel with event check", async ({ page }) => {
    const journeyPage = new MartechJourneyPage(page);
    const journeyName = uniqueName("EventJourney");

    await journeyPage.createAndPublishEventBasedSmsJourney(journeyName);
  });

  test("To Publish Event based Journey for WhatsApp channel with Go To and time delay", async ({ page }) => {
    const journeyPage = new MartechJourneyPage(page);
    const journeyName = uniqueName("WAEventJourney");

    await journeyPage.createAndPublishEventBasedWhatsAppJourneyWithGoToAndTimeDelay(journeyName);
  });

  test("To Publish Event based Journey for AI Calling channel with message engagement and time delay", async ({ page, app }) => {
    const martechSegmentsPage = new MartechSegmentsPage(page);
    await new ProjectSwitcherPage(page).ensureActiveProject(
      process.env.MARTECH_AI_CALLING_PROJECT_NAME || "Parth lakefront",
    );
    await martechSegmentsPage.openActiveLeadCampaigns(app);

    const journeyPage = new MartechJourneyPage(page);
    const journeyName = uniqueName("AICallJourneyEvent");

    await journeyPage.createAndPublishEventBasedAiCallingJourneyWithMessageEngagement(journeyName);
  });
});
