import { expect, type Page } from "@playwright/test";
import { LoginPage } from "./LoginPage";
import { ProjectSwitcherPage } from "./ProjectSwitcherPage";
import { clickFirstVisible } from "../support/ui-actions";

export type UserManagementAppConfig = {
  baseUrl?: string;
  activeProjectName: string;
  mobileNumber?: string;
  otp?: string;
};

export class UserManagementPage {
  constructor(private readonly page: Page) {}

  get settingsModuleButton() {
    return this.page
      .locator("button")
      .filter({ has: this.page.locator('img[alt*="settings" i]') })
      .first();
  }

  get userManagementNavCandidates() {
    return [
      this.page
        .locator("div")
        .filter({ hasText: /^User ManagementCreate and Manage access of users/i })
        .first(),
      this.page
        .locator("div")
        .filter({ hasText: /User Management/i })
        .filter({ hasText: /Create and Manage access of users/i })
        .first(),
      this.page.locator('a[href*="user-managment"], a[href*="user-management"]').first(),
      this.page.getByRole("link", { name: /users?|user management|team|members/i }).first(),
      this.page.getByRole("button", { name: /users?|user management|team|members/i }).first(),
      this.page.locator("a,button").filter({ hasText: /users?|user management|team|members/i }).first(),
      this.page.getByText(/users?|user management|team|members/i).first(),
    ];
  }

  get createUserCandidates() {
    return [
      this.page.getByRole("button", { name: /add user|create user|new user|invite user|add member/i }).first(),
      this.page.getByRole("link", { name: /add user|create user|new user|invite user|add member/i }).first(),
      this.page.locator("button,a").filter({ hasText: /add user|create user|new user|invite user|add member/i }).first(),
    ];
  }

  async open(app: UserManagementAppConfig) {
    const directPaths = [
      "/admin/developer/users",
      "/admin/developer/user-management",
      "/admin/developer/settings/users",
      "/admin/developer/settings/user-management",
      "/admin/developer/lead-settings/user-managment",
      "/admin/developer/cpms/users",
    ];

    for (const directPath of directPaths) {
      await this.page.goto(directPath, { waitUntil: "domcontentloaded" });
      if (await this.isReady()) {
        return;
      }
    }

    await this.page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "networkidle" });
    await this.loginAgainIfSessionExpired(app);
    await new ProjectSwitcherPage(this.page).ensureActiveProject(app.activeProjectName);

    if (await this.settingsModuleButton.isVisible().catch(() => false)) {
      await this.settingsModuleButton.click({ force: true });
      await this.page.waitForLoadState("domcontentloaded").catch(() => {});
      await expect
        .poll(async () => /Settings|User Management/i.test(await this.page.locator("body").innerText().catch(() => "")), {
          timeout: 30000,
        })
        .toBeTruthy()
        .catch(() => {});
    }

    const openedFromCard = await this.clickUserManagementCard();
    if (!openedFromCard) {
      await clickFirstVisible(
        this.userManagementNavCandidates,
        "user management navigation"
      );
    }

    await this.waitForReady();
  }

  async openCreateUserForm() {
    await this.waitForReady();
    await clickFirstVisible(this.createUserCandidates, "create user");
  }

  async expectUserListed(email: string) {
    await expect(this.page.getByText(email, { exact: false })).toBeVisible({ timeout: 60000 });
  }

  private async waitForReady() {
    await expect.poll(() => this.isReady(), { timeout: 60000 }).toBeTruthy();
  }

  private async isReady() {
    const hasHeading = await this.page
      .getByRole("heading", { name: /users?|user management|team|members/i })
      .first()
      .isVisible()
      .catch(() => false);
    if (hasHeading) {
      return true;
    }

    for (const candidate of this.createUserCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        return true;
      }
    }

    return false;
  }

  private async clickUserManagementCard() {
    const cardCandidates = [
      this.page
        .getByText(/^User Management$/i)
        .locator("xpath=ancestor::*[contains(., 'Create and Manage access of users')][1]")
        .first(),
      this.page
        .locator("div")
        .filter({ hasText: /User Management/i })
        .filter({ hasText: /Create and Manage access of users/i })
        .first(),
      this.page.locator('a[href*="user-managment"], a[href*="user-management"]').first(),
      this.page.getByText(/^User Management$/i).first(),
      this.page.getByText(/User Management/i).first(),
    ];

    for (const card of cardCandidates) {
      if (!(await card.isVisible({ timeout: 30000 }).catch(() => false))) {
        continue;
      }

      await card.scrollIntoViewIfNeeded().catch(() => {});
      await card.click({ force: true });
      return true;
    }

    const bodyText = await this.page.locator("body").innerText().catch(() => "");
    const viewport = this.page.viewportSize();
    if (/Settings/i.test(bodyText) && /User Management/i.test(bodyText) && viewport) {
      const clicked = await this.page.evaluate(() => {
        const normalize = (value: string | null | undefined) =>
          (value ?? "").replace(/\s+/g, " ").trim();
        const visible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden"
          );
        };

        const title = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, span, div"))
          .find((element) => /^User Management$/i.test(normalize(element.innerText || element.textContent)) && visible(element));
        if (!title) {
          return false;
        }

        let clickable: HTMLElement = title;
        let parent = title.parentElement;
        for (let depth = 0; parent && depth < 8; depth += 1) {
          const text = normalize(parent.innerText || parent.textContent);
          if (/User Management/i.test(text) && /Create and Manage access of users/i.test(text)) {
            clickable = parent;
          }
          parent = parent.parentElement;
        }

        clickable.scrollIntoView({ block: "center", inline: "center" });
        clickable.click();
        return true;
      }).catch(() => false);

      if (clicked) {
        return true;
      }

      await this.page.mouse.click(Math.floor(viewport.width * 0.53), Math.floor(viewport.height * 0.72));
      return true;
    }

    return await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      };

      const title = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, span, div"))
        .filter((element) => /User Management/i.test(normalize(element.innerText || element.textContent)) && visible(element))
        .sort((left, right) =>
          normalize(left.innerText || left.textContent).length -
          normalize(right.innerText || right.textContent).length,
        )[0];
      if (!title) {
        return false;
      }

      let clickable: HTMLElement | null = title;
      let parent = title.parentElement;
      for (let depth = 0; parent && depth < 8; depth += 1) {
        const style = window.getComputedStyle(parent);
        const text = normalize(parent.innerText || parent.textContent);
        if (
          (style.cursor === "pointer" || parent.querySelector("svg, img")) &&
          /User Management/i.test(text) &&
          /Create and Manage access of users|User Management/i.test(text)
        ) {
          clickable = parent;
        }
        parent = parent.parentElement;
      }

      clickable.click();
      return true;
    });
  }

  private async loginAgainIfSessionExpired(app: UserManagementAppConfig) {
    const onLoginPage =
      /\/admin\/login/i.test(this.page.url()) ||
      (await this.page.getByRole("heading", { name: /Mobile Number/i }).isVisible().catch(() => false));

    if (!onLoginPage) {
      return;
    }

    if (!app.baseUrl || !app.mobileNumber || !app.otp) {
      throw new Error("Authenticated session expired and login credentials were not available to recover it.");
    }

    await new LoginPage(this.page).login({
      baseUrl: app.baseUrl,
      mobileNumber: app.mobileNumber,
      otp: app.otp,
    });
    await this.page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "networkidle" });
  }
}
