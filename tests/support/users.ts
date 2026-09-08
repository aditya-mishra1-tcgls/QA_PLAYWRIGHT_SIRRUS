import type { Page } from "@playwright/test";
import { test as base } from "@playwright/test";
import { UserManagementPage } from "../pages";
import { clickFirstVisible, escapeRegex, fillFirstVisible, visibleCandidate } from "./ui-actions";

type AppConfig = {
  envName: string;
  baseUrl: string;
  activeProjectName: string;
  adminUser?: {
    email?: string;
    password?: string;
  };
};

type AutomationUserSeed = {
  fullName: string;
  email: string;
  password: string;
  role: string;
};

function randomAlphaNumeric(length: number) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

export function getConfiguredAdminCredential(app: AppConfig) {
  return {
    loginPage: new URL("/admin/login", app.baseUrl).toString(),
    mobileNumber: process.env.ADMIN_MOBILE_NUMBER || process.env.ADMIN_LOGIN_MOBILE || "",
    otp: process.env.ADMIN_OTP || process.env.ADMIN_LOGIN_OTP || "",
    email: app.adminUser?.email || process.env.ADMIN_EMAIL || "",
    password: app.adminUser?.password || process.env.ADMIN_PASSWORD || "",
  };
}

export function buildAutomationUserSeed(app: AppConfig): AutomationUserSeed {
  const suffix = `${app.envName}-${Date.now()}-${randomAlphaNumeric(4)}`.toLowerCase();
  const emailDomain = process.env.AUTOMATION_USER_EMAIL_DOMAIN || "sirrus.ai";

  return {
    fullName: `QA Automation User ${suffix}`,
    email: `qa.automation+${suffix}@${emailDomain}`,
    password: process.env.AUTOMATION_USER_DEFAULT_PASSWORD || `Sirrus@${randomAlphaNumeric(8)}`,
    role: process.env.AUTOMATION_USER_ROLE || "Sales",
  };
}

export async function openUserManagement(page: Page, app: AppConfig) {
  await base.step("Open admin user management", async () => {
    await new UserManagementPage(page).open(app);
  });
}

export async function createAutomationUser(page: Page, app: AppConfig, seed = buildAutomationUserSeed(app)) {
  await openUserManagement(page, app);

  await base.step("Open create user form", async () => {
    await new UserManagementPage(page).openCreateUserForm();
  });

  await base.step("Fill user details", async () => {
    await fillFirstVisible(
      [
        page.getByLabel(/full name|name/i).first(),
        visibleCandidate(page, ['input[name="name"]', 'input[name="fullName"]', 'input[placeholder*="name" i]']),
      ],
      seed.fullName,
      "name"
    );

    await fillFirstVisible(
      [
        page.getByLabel(/email/i).first(),
        visibleCandidate(page, ['input[type="email"]', 'input[name="email"]', 'input[placeholder*="email" i]']),
      ],
      seed.email,
      "email"
    );

    await fillFirstVisible(
      [
        page.getByLabel(/password/i).first(),
        visibleCandidate(page, ['input[type="password"]', 'input[name="password"]', 'input[placeholder*="password" i]']),
      ],
      seed.password,
      "password"
    );

    const roleControl = page.getByLabel(/role|designation|profile/i).first();
    if (await roleControl.isVisible().catch(() => false)) {
      await roleControl.click();
      const escapedRole = escapeRegex(seed.role);
      const roleOption = page.getByRole("option", { name: new RegExp(escapedRole, "i") }).first();
      if (await roleOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        await roleOption.click();
      }
    }
  });

  await base.step("Submit user creation", async () => {
    await clickFirstVisible(
      [
        page.getByRole("button", { name: /save|create|submit|invite|add user/i }).first(),
        page.locator('button[type="submit"]').first(),
      ],
      "save user"
    );
  });

  await base.step("Verify user is listed", async () => {
    await new UserManagementPage(page).expectUserListed(seed.email);
  });

  return seed;
}
