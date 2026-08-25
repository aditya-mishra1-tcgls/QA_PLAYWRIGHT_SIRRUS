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

export { expect };
