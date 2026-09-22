import type { Page } from "@playwright/test";
import { expect, test } from "../../support/test";
import { MartechSegmentsPage } from "../../pages";

function uniqueName(prefix: string) {
  return `${prefix}${Date.now().toString().slice(-6)}`;
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

test.describe("Rule Based Segmentation flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 420000));
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page, app }) => {
    const martechSegmentsPage = new MartechSegmentsPage(page);
    await martechSegmentsPage.openActiveLeadCampaigns(app);
    await fitMartechPageToViewport(page);
  });

  test("Create rule based segment using user actions", async ({ page }) => {
    const martechSegmentsPage = new MartechSegmentsPage(page);
    const segmentName = uniqueName("UserActionRuleSegment");

    await martechSegmentsPage.createRuleBasedUserActionSegment(segmentName);

    await expect(page.getByText(new RegExp(`^${segmentName}$`, "i")).first()).toBeVisible();
  });

  test("Create rule based segment using engagement history", async ({ page }) => {
    const martechSegmentsPage = new MartechSegmentsPage(page);
    const segmentName = uniqueName("EngagementRuleSegment");

    await martechSegmentsPage.createRuleBasedEngagementHistorySegment(segmentName);

    await expect(page.getByText(new RegExp(`^${segmentName}$`, "i")).first()).toBeVisible();
  });
});
