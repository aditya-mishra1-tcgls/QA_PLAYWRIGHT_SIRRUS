import { test as base, expect } from "@playwright/test";
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

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) {
    return;
  }

  const captures = [
    { name: "Failure state", file: "failure-state.png", fullPage: false },
    { name: "Failure full page", file: "failure-full-page.png", fullPage: true },
    { name: "Failure state after 1 second", file: "failure-after-1-second.png", fullPage: false, wait: true }
  ];

  for (const capture of captures) {
    try {
      if (capture.wait) {
        await page.waitForTimeout(1000);
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
