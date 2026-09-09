import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "./tests/support/env";
import { getAuthStatePath } from "./tests/support/auth";

const env = loadEnv();
const authStatePath = getAuthStatePath(env.envName);
const pageZoom = Number(process.env.PLAYWRIGHT_PAGE_ZOOM || 1);
const desktopChrome = devices["Desktop Chrome"];
const zoomedViewport = {
  width: Math.round((desktopChrome.viewport?.width || 1280) / pageZoom),
  height: Math.round(Math.max(desktopChrome.viewport?.height || 720, 900) / pageZoom)
};
const zoomedDesktopChrome = {
  ...desktopChrome,
  viewport: zoomedViewport
};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never" }]
  ],
  use: {
    baseURL: env.baseUrl,
    trace: "on-first-retry",
    // The shared fixture captures three labeled failure screenshots for the dashboard.
    screenshot: "off",
    video: "on"
  },
  projects: [
    {
      name: "setup",
      testMatch: /tests\/setup\/.*\.ts/,
      use: { ...zoomedDesktopChrome }
    },
    {
      name: "chromium",
      testIgnore: /tests\/setup\/.*\.ts/,
      use: {
        ...zoomedDesktopChrome,
        storageState: authStatePath
      },
      dependencies: ["setup"]
    }
  ]
});
