import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test as base } from "@playwright/test";
import { LoginPage, ProjectSwitcherPage } from "../pages";

type AppConfig = {
  envName: string;
  baseUrl: string;
  activeProjectName: string;
  mobileNumber: string;
  otp: string;
};

function safeAuthStateSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

export function getAuthStatePath(envName: string) {
  const authStateKey = process.env.PLAYWRIGHT_AUTH_STATE_KEY
    || process.env.QA_DASHBOARD_RUN_ID
    || process.env.QA_DASHBOARD_RUN_USER
    || "";
  const suffix = authStateKey ? `-${safeAuthStateSegment(authStateKey)}` : "";
  return path.resolve("playwright", ".auth", `${safeAuthStateSegment(envName)}${suffix}.json`);
}

export async function ensureActiveProject(page: Page, projectName: string) {
  return await new ProjectSwitcherPage(page).ensureActiveProject(projectName);
}

export async function loginToPlatform(page: Page, app: AppConfig) {
  await base.step("Open login page", async () => {
    const loginPage = new LoginPage(page);
    await loginPage.open(app.baseUrl);
    await loginPage.openLoginForm();
  });

  await base.step("Enter mobile number", async () => {
    await new LoginPage(page).enterMobileNumber(app.mobileNumber);
  });

  await base.step("Request OTP", async () => {
    await new LoginPage(page).requestOtp(app.mobileNumber);
  });

  await base.step("Enter OTP", async () => {
    await new LoginPage(page).enterOtp(app.otp);
  });

  await base.step("Submit login", async () => {
    await new LoginPage(page).submitAndWaitForHome();
  });

  await base.step("Select active project", async () => {
    app.activeProjectName = await ensureActiveProject(page, app.activeProjectName);
  });
}

export async function saveAuthenticatedState(page: Page, envName: string) {
  await base.step("Save authenticated session", async () => {
    const authStatePath = getAuthStatePath(envName);
    fs.mkdirSync(path.dirname(authStatePath), { recursive: true });
    await page.context().storageState({ path: authStatePath });
  });
}
