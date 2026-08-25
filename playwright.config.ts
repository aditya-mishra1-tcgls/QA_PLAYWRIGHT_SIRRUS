import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "./tests/support/env";
import { getAuthStatePath } from "./tests/support/auth";

const env = loadEnv();
const authStatePath = getAuthStatePath(env.envName);

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
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "setup",
      testMatch: /tests\/setup\/.*\.ts/,
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "chromium",
      testIgnore: /tests\/setup\/.*\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStatePath
      },
      dependencies: ["setup"]
    }
  ]
});
