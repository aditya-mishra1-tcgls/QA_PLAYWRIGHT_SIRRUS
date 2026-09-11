import type { Page } from "@playwright/test";
import { expect, test as base } from "@playwright/test";
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
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  password: string;
  role: string;
  mobileNumber: string;
};

function randomAlphaNumeric(length: number) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

function randomLetters(length: number) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
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
  const emailDomain = process.env.AUTOMATION_USER_EMAIL_DOMAIN || "tt.in";
  const emailLocalPart = `qaautomation${suffix.replace(/[^a-z0-9]/g, "")}`;
  const firstName = `QA Auto ${randomLetters(4)}`;
  const lastName = `User ${randomLetters(4)}`;

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email: `${emailLocalPart}@${emailDomain}`,
    password: process.env.AUTOMATION_USER_DEFAULT_PASSWORD || `Sirrus@${randomAlphaNumeric(8)}`,
    role: process.env.AUTOMATION_USER_ROLE || "Sales",
    mobileNumber: process.env.AUTOMATION_USER_MOBILE_NUMBER || `9${Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("")}`,
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
    const firstNameField = page.locator("#firstName").first();
    const addUserDetailsVisible = await page.getByText(/Add User Details/i).first().isVisible().catch(() => false);
    if (addUserDetailsVisible || await firstNameField.isVisible().catch(() => false)) {
      await fillFirstVisible([
        firstNameField,
        page.getByText(/^First Name\s*\*?$/i).locator("xpath=following::input[1]").first(),
        page.locator('input[placeholder="Enter here"]').nth(0),
      ], seed.firstName, "first name");
      await fillFirstVisible([
        page.locator("#lastName").first(),
        page.getByText(/^Last Name\s*\*?$/i).locator("xpath=following::input[1]").first(),
        page.locator('input[placeholder="Enter here"]').nth(1),
      ], seed.lastName, "last name");
      await fillFirstVisible([
        page.getByText(/^Mobile Number\s*\*?$/i).locator("xpath=following::input[1]").first(),
        page.getByRole("textbox", { name: /Enter Mobile Number/i }).first(),
        page.locator('input[placeholder*="Mobile" i]').first(),
      ], seed.mobileNumber, "mobile number");
      await fillFirstVisible([
        page.locator("#email").first(),
        page.getByText(/^Email ID\s*\*?$/i).locator("xpath=following::input[1]").first(),
        page.locator('input[placeholder="Enter here"]').nth(2),
      ], seed.email, "email");
      await selectUserDropdownOption(page, /^Role\s*\*?$/i, process.env.AUTOMATION_USER_ROLE || "Presales Head Group");
      await selectUserDropdownOption(page, /^Reporting Manager\s*\*?$/i, process.env.AUTOMATION_USER_REPORTING_MANAGER || "Aadi Gala Admin");
      await selectUserDropdownOption(page, /^Projects Allocated\s*\*?$/i, process.env.AUTOMATION_USER_PROJECT || "All Projects");
      await closeOpenDropdowns(page);
      return;
    }

    const genericTextFields = page.locator(
      'input:not([type="hidden"]):not([type="email"]):not([type="password"]):not([type="date"]):not([type="time"]):not([type="search"]), textarea'
    );
    const nameFieldCandidates = [
      page.getByLabel(/full name|name/i).first(),
      visibleCandidate(page, ['input[name="name"]', 'input[name="fullName"]', 'input[placeholder*="name" i]', 'input[aria-label*="name" i]']),
      genericTextFields.filter({ hasNot: page.locator('[disabled],[aria-disabled="true"],[readonly]') }).first(),
      page.locator('input:not([type]), input[type="text"]').filter({ hasNot: page.locator('[disabled],[aria-disabled="true"],[readonly]') }).first(),
    ];

    let visibleNameField = null as ReturnType<typeof page.locator> | null;
    await expect
      .poll(async () => {
        for (const candidate of nameFieldCandidates) {
          if (await candidate.isVisible().catch(() => false)) {
            visibleNameField = candidate;
            return true;
          }
        }

        return false;
      }, { timeout: 60000 })
      .toBeTruthy();

    if (!visibleNameField) {
      for (const candidate of nameFieldCandidates) {
        if (await candidate.isVisible().catch(() => false)) {
          visibleNameField = candidate;
          break;
        }
      }
    }

    if (!visibleNameField) {
      throw new Error("Unable to find visible name field.");
    }
    await visibleNameField.fill(seed.fullName);

    await fillFirstVisible(
      [
        page.getByLabel(/email/i).first(),
        visibleCandidate(page, ['input[type="email"]', 'input[name="email"]', 'input[placeholder*="email" i]']),
      ],
      seed.email,
      "email"
    );

    const passwordFieldVisible = await page
      .locator('input[type="password"], input[name="password"], input[placeholder*="password" i]')
      .first()
      .isVisible()
      .catch(() => false);
    if (passwordFieldVisible) {
      await fillFirstVisible(
      [
        page.getByLabel(/password/i).first(),
        visibleCandidate(page, ['input[type="password"]', 'input[name="password"]', 'input[placeholder*="password" i]']),
      ],
      seed.password,
      "password"
      );
    }

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
    await closeOpenDropdowns(page);
    const submitButton = page.getByRole("button", { name: /^Submit$/i }).last();
    if (await submitButton.isVisible().catch(() => false)) {
      await expect(submitButton).toBeEnabled({ timeout: 10000 });
      await submitButton.click({ force: true });
    } else {
      await clickFirstVisible(
      [
        page.getByRole("button", { name: /save|create|submit|invite/i }).last(),
        page.locator('button[type="submit"]').first(),
      ],
      "save user",
      { force: true }
      );
    }

    await expect(page.locator("body")).toContainText(/User Added Successfully|User Added|successfully/i, {
      timeout: 30000,
    }).catch(() => {});
  });

  await base.step("Verify user is listed", async () => {
    await new UserManagementPage(page).expectUserListed(seed.email);
  });

  return seed;
}

async function selectUserDropdownOption(page: Page, label: RegExp, optionName?: string) {
  const dropdown = page.getByText(label).locator("xpath=following::button[1]").first();
  if (!(await dropdown.isVisible().catch(() => false))) {
    return false;
  }

  await dropdown.click({ force: true });
  if (optionName) {
    const option = page.getByRole("button", { name: optionName, exact: true }).first();
      if (await option.isVisible({ timeout: 10000 }).catch(() => false)) {
      await option.click({ force: true });
      await closeOpenDropdowns(page);
      return true;
    }
  }

  const selected = await page
    .locator("button, [role='option'], [role='menuitem']")
    .evaluateAll((elements) => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const visible = (element: Element) => {
        const htmlElement = element as HTMLElement;
        const rect = htmlElement.getBoundingClientRect();
        const style = window.getComputedStyle(htmlElement);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const option = elements.find((element) => {
        const text = normalize(element.textContent);
        return visible(element) && text && !/^Select here$/i.test(text);
      }) as HTMLElement | undefined;
      option?.click();
      return Boolean(option);
    });

  await closeOpenDropdowns(page);
  return selected;
}

async function closeOpenDropdowns(page: Page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator(".grid").first().click({ force: true, timeout: 2000 }).catch(() => {});
  await page.mouse.click(160, 130).catch(() => {});
  await page.waitForTimeout(300);
}
