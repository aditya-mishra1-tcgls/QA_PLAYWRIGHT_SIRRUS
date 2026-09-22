import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../../support/test";
import { LeadListPage, MartechSegmentsPage } from "../../pages";
import leadFlowConfig from "../../data/lead-flow.json";
import {
  assertLeadCreated,
  buildLeadSeed,
  fillLeadFormWithSeed,
  goToManageLeads,
} from "../../support/leads";

function uniqueName(prefix: string) {
  return `${prefix}${Date.now().toString().slice(-6)}`;
}

function retargetingPhoneCsvPath() {
  return path.resolve("tests/data/martech/retargeting-phone-segment.csv");
}

function overwritePhoneSegmentCsv(phoneNumber: string) {
  const csvPath = retargetingPhoneCsvPath();
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, `phone\n${phoneNumber}\n`, "utf8");
  return csvPath;
}

async function expectCreatedLeadInNewStage(page: Page, leadName: string) {
  const leadListPage = new LeadListPage(page);
  await page.getByRole("button", { name: /^New Lead\s+\d+$/i }).first().click({ timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await leadListPage.expectLeadVisible(leadName);
  await expect(page.getByRole("link", { name: /^New Lead$/i }).first()).toBeVisible({ timeout: 60000 });
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
          super(value as number, monthIndex as number, date, hours, minutes, seconds, ms);
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

type RetargetingApp = Parameters<typeof goToManageLeads>[1] & {
  martechBaseUrl?: string;
};

async function createRetargetingPhoneSegment(page: Page, app: RetargetingApp) {
  const martechApp = {
    ...app,
    baseUrl: app.martechBaseUrl || app.baseUrl,
  };
  const leadFlowProject = leadFlowConfig[martechApp.envName as keyof typeof leadFlowConfig]?.projectName;
  if (leadFlowProject) {
    martechApp.activeProjectName = leadFlowProject;
  }

  await goToManageLeads(page, martechApp);
  const leadSeed = buildLeadSeed(martechApp.envName);
  const preparedLeadSeed = await fillLeadFormWithSeed(page, martechApp, leadSeed, [
    "Digital Marketing",
    "Channel Partner",
  ]);
  await assertLeadCreated(page, preparedLeadSeed.fullName, preparedLeadSeed.projectName);
  await expectCreatedLeadInNewStage(page, preparedLeadSeed.fullName);

  const csvPath = overwritePhoneSegmentCsv(preparedLeadSeed.whatsappNumber);
  const segmentName = uniqueName("RetargetPhoneSeg");
  const martechSegmentsPage = new MartechSegmentsPage(page);

  await martechSegmentsPage.openActiveLeadCampaigns(app);
  await martechSegmentsPage.createPhoneSegmentFromCsv(segmentName, csvPath);
  await martechSegmentsPage.openCreatedSegmentDetails(segmentName);

  return { martechSegmentsPage, segmentName };
}

test.describe("Retargeting flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 360000));

  test.beforeEach(async ({ page }) => {
    await useBusinessHoursClock(page);
  });

  test("manual add segment functionality using CSV file for phone", async ({ page, app }) => {
    const { segmentName } = await createRetargetingPhoneSegment(page, app);

    await expect(page.locator("body")).toContainText(new RegExp(segmentName), { timeout: 60000 });
  });

  test('create and publish campaign via "Send Now" campaign option for the SMS channel using a phone segment', async ({
    page,
    app,
  }) => {
    const { martechSegmentsPage } = await createRetargetingPhoneSegment(page, app);
    const campaignName = uniqueName("RetargetSmsCampaign");

    await martechSegmentsPage.createAndPublishSendNowCampaign("SMS", campaignName);

    await expect(page.getByText(new RegExp(`^${campaignName}$`, "i")).first()).toBeVisible({ timeout: 60000 });
  });
});
