import type { Page } from "@playwright/test";
import { expect, test as base, type Locator } from "@playwright/test";
import { ensureActiveProject } from "./auth";

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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function visibleCandidate(page: Page, selectors: string[]) {
  return page
    .locator(selectors.join(", "))
    .filter({ hasNot: page.locator("[disabled]") })
    .first();
}

async function fillFirstVisible(candidates: Locator[], value: string, label: string) {
  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.fill(value);
      return;
    }
  }

  throw new Error(`Unable to find visible ${label} field on the user creation form.`);
}

async function clickFirstVisible(candidates: Locator[], label: string) {
  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click();
      return;
    }
  }

  throw new Error(`Unable to find visible ${label} control on the user management screen.`);
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
    await ensureActiveProject(page, app.activeProjectName);

    const directPaths = [
      "/admin/developer/users",
      "/admin/developer/user-management",
      "/admin/developer/settings/users",
      "/admin/developer/cpms/users",
    ];

    for (const directPath of directPaths) {
      await page.goto(directPath, { waitUntil: "domcontentloaded" });
      const looksLikeUserPage = await page
        .getByRole("heading", { name: /users?|user management|team|members/i })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (looksLikeUserPage) {
        return;
      }
    }

    await page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "networkidle" });
    await clickFirstVisible(
      [
        page.getByRole("link", { name: /users?|user management|team|members/i }).first(),
        page.getByRole("button", { name: /users?|user management|team|members/i }).first(),
        page.locator("a,button").filter({ hasText: /users?|user management|team|members/i }).first(),
      ],
      "user management navigation"
    );
  });
}

export async function createAutomationUser(page: Page, app: AppConfig, seed = buildAutomationUserSeed(app)) {
  await openUserManagement(page, app);

  await base.step("Open create user form", async () => {
    await clickFirstVisible(
      [
        page.getByRole("button", { name: /add user|create user|new user|invite user|add member/i }).first(),
        page.getByRole("link", { name: /add user|create user|new user|invite user|add member/i }).first(),
        page.locator("button,a").filter({ hasText: /add user|create user|new user|invite user|add member/i }).first(),
      ],
      "create user"
    );
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
    await expect(page.getByText(seed.email, { exact: false })).toBeVisible({ timeout: 60000 });
  });

  return seed;
}
