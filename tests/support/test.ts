import { test as base, expect, type Page } from "@playwright/test";
import { loadEnv } from "./env";

type Fixtures = {
  app: {
    envName: string;
    baseUrl: string;
    activeProjectName: string;
    mobileNumber: string;
    otp: string;
    users: Record<string, unknown>;
    leads: Record<string, unknown>;
  };
};

export const test = base.extend<Fixtures>({
  app: async ({}, use) => {
    await use(loadEnv());
  }
});

async function scrollFailureContext(page: Page, direction: "top" | "bottom") {
  await page.evaluate((targetDirection) => {
    const candidates = [
      document.scrollingElement,
      ...Array.from(document.querySelectorAll<HTMLElement>("main, section, article, div"))
    ].filter(Boolean) as HTMLElement[];

    const scrollable = candidates
      .filter((element) => element.scrollHeight > element.clientHeight + 20)
      .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];

    if (!scrollable) {
      return;
    }

    scrollable.scrollTop = targetDirection === "top" ? 0 : scrollable.scrollHeight;
  }, direction);
  await page.waitForTimeout(300);
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) {
    return;
  }

  const captures = [
    { name: "01 Last step execution", file: "01-last-step-execution.png", fullPage: false },
    { name: "02 Full page from top", file: "02-full-page-from-top.png", fullPage: true, scroll: "top" as const },
    { name: "03 Viewport after page bottom", file: "03-viewport-after-page-bottom.png", fullPage: false, scroll: "bottom" as const }
  ];

  for (const capture of captures) {
    try {
      if (capture.scroll) {
        await scrollFailureContext(page, capture.scroll);
      }
      const screenshotPath = testInfo.outputPath(capture.file);
      await page.screenshot({ path: screenshotPath, fullPage: capture.fullPage });
      await testInfo.attach(capture.name, { path: screenshotPath, contentType: "image/png" });
    } catch {
      // Preserve the original test failure if its browser context has already closed.
    }
  }
});

export { expect };
