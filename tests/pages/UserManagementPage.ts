import { expect, type Page } from "@playwright/test";
import { ProjectSwitcherPage } from "./ProjectSwitcherPage";
import { ensureAuthenticatedSession } from "../support/session";
import { clickFirstVisible, normalizeText } from "../support/ui-actions";

export type UserManagementAppConfig = {
  baseUrl?: string;
  activeProjectName: string;
  mobileNumber?: string;
  otp?: string;
};

export class UserManagementPage {
  constructor(private readonly page: Page) {}

  private async clickVisibleTextByPattern(pattern: RegExp, label: string) {
    const clicked = await this.page
      .evaluate((matcher) => {
        const regex = new RegExp(matcher.source, matcher.flags);
        const normalize = (value: string | null | undefined) =>
          (value ?? "").replace(/\s+/g, " ").trim();

        const visible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.pointerEvents !== "none"
          );
        };

        const nodes = Array.from(document.querySelectorAll<HTMLElement>("button, a, div, span, li"));
        const target = nodes.find((element) => {
          const text = normalize(element.innerText || element.textContent || "");
          return regex.test(text) && visible(element);
        });

        if (!target) {
          return false;
        }

        target.scrollIntoView({ block: "center", inline: "center" });
        target.click();
        return true;
      }, pattern)
      .catch(() => false);

    if (!clicked) {
      throw new Error(`Unable to find visible ${label}.`);
    }

    return true;
  }

  get settingsModuleButton() {
    return this.page
      .locator("button")
      .filter({ has: this.page.locator('img[alt*="settings" i]') })
      .first();
  }

  get userManagementNavCandidates() {
    return [
      this.page.getByRole("link", { name: /User Management\s+Create and/i }).first(),
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
      this.page.locator("a,button,div,li").filter({ hasText: /users?|user management|team|members/i }).first(),
      this.page.locator('[aria-label*="user management" i], [aria-label*="user" i], [title*="user management" i], [title*="users" i]').first(),
      this.page.locator('button, a').filter({ has: this.page.locator('img[alt*="user" i], img[alt*="settings" i]') }).first(),
      this.page.getByText(/users?|user management|team|members/i).first(),
    ];
  }

  get createUserCandidates() {
    return [
      this.page.locator("button").filter({ hasText: /^Add User$/i }).first(),
      this.page.getByText(/^Add User$/i).locator("xpath=ancestor::button[1]").first(),
      this.page.getByRole("button", { name: /create|add/i }).filter({ hasText: /user|member|account/i }).first(),
      this.page.getByRole("link", { name: /create|add/i }).filter({ hasText: /user|member|account/i }).first(),
      this.page.getByRole("button", { name: /add user|create user|new user|invite user|add member|new member/i }).first(),
      this.page.getByRole("link", { name: /add user|create user|new user|invite user|add member|new member/i }).first(),
      this.page.locator("button,a").filter({ hasText: /add user|create user|new user|invite user|add member|new member/i }).first(),
      this.page.getByText(/add user|create user|new user|invite user|add member|new member/i).first(),
    ];
  }

  async open(app: UserManagementAppConfig) {
    await this.page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "domcontentloaded" });
    await this.loginAgainIfSessionExpired(app);
    app.activeProjectName = await new ProjectSwitcherPage(this.page)
      .ensureActiveProject(app.activeProjectName)
      .catch(() => app.activeProjectName);

    await this.page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "domcontentloaded" });

    if (await this.settingsModuleButton.isVisible().catch(() => false)) {
      await this.settingsModuleButton.click({ force: true });
      await this.page.waitForLoadState("domcontentloaded").catch(() => {});
      await expect
        .poll(async () => /Settings|User Management/i.test(await this.page.locator("body").innerText().catch(() => "")), {
          timeout: 30000,
        })
        .toBeTruthy()
        .catch(() => {});

      const opened = await clickFirstVisible(this.userManagementNavCandidates, "user management navigation", {
        force: true,
      }).then(() => true).catch(() => false);
      if (opened) {
        await this.waitForReady();
        return;
      }
    }

    const liveUserManagementLink = this.page
      .locator('a[href*="user-managment"], a[href*="user-management"]')
      .filter({ hasText: /user management/i })
      .first();
    if (await liveUserManagementLink.isVisible().catch(() => false)) {
      await liveUserManagementLink.click({ force: true });
      await this.waitForReady();
      return;
    }

    const openedFromCard = await this.clickUserManagementCard();
    if (!openedFromCard) {
      const fallbackNavigations = [
        this.page.getByText(/User Management/i).last(),
        this.page.getByText(/Users?/i).last(),
        this.page.locator("button, a, div, li").filter({ hasText: /User Management/i }).first(),
        ...this.userManagementNavCandidates,
      ];

      const successfullyOpened = await clickFirstVisible(
        fallbackNavigations,
        "user management navigation",
        { force: true },
      ).then(() => true).catch(() => false);

      if (!successfullyOpened) {
        await this.page.goto("/admin/developer/users", { waitUntil: "domcontentloaded" });
      }
    }

    await this.waitForReady();
  }

  async openCreateUserForm() {
    await this.waitForReady();

    const clickedDirectly = await clickFirstVisible(this.createUserCandidates, "create user").then(() => true).catch(() => false);
    if (!clickedDirectly) {
      const userManagementLink = this.page
        .getByRole("link", { name: /user management/i })
        .first();
      if (await userManagementLink.isVisible().catch(() => false)) {
        await userManagementLink.click({ force: true });
      }

      const fallback = this.page
        .locator("button, a, div, span")
        .filter({ hasText: /add user|create user|new user|invite user|add member|new member/i })
        .first();
      if (await fallback.count().catch(() => 0)) {
        await fallback.click({ force: true }).catch(() => {});
      }

      const genericCreate = this.page
        .locator("button, a")
        .filter({ hasText: /create|add/i })
        .filter({ hasText: /user|member|account/i })
        .first();
      if (await genericCreate.count().catch(() => 0)) {
        await genericCreate.click({ force: true }).catch(() => {});
      }

      if (!(await this.page.getByRole("textbox", { name: /full name|name/i }).first().isVisible().catch(() => false))) {
        await this.clickVisibleTextByPattern(
          /add user|create user|new user|invite user|add member|new member/i,
          "create user",
        ).catch(() => {});
      }
    }

    const formOpened = await this.waitForCreateUserForm(15000);
    if (!formOpened) {
      await this.clickAddUserButtonWithDom();
      await this.clickAddUserButtonWithMouse();
      await this.waitForCreateUserForm(60000, true);
    }
  }

  async expectUserListed(email: string) {
    await expect(this.page.getByText(email, { exact: false })).toBeVisible({ timeout: 60000 });
  }

  private async waitForReady() {
    await expect.poll(() => this.isReady(), { timeout: 60000 }).toBeTruthy();
  }

  private async waitForCreateUserForm(timeout = 60000, throwOnTimeout = false) {
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    const opened = await expect
      .poll(async () => await this.isCreateUserFormVisible(), { timeout })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!opened && throwOnTimeout) {
      throw new Error("Create user form did not open after clicking Add User.");
    }

    return opened;
  }

  private async isCreateUserFormVisible() {
    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    if (/Add User Details/i.test(bodyText)) {
      return true;
    }

    if (/First Name/i.test(bodyText) && /Last Name/i.test(bodyText)) {
      return true;
    }

    const candidates = [
      this.page.locator("#firstName").first(),
      this.page.locator("#lastName").first(),
      this.page.getByText(/^First Name\s*\*?$/i).locator("xpath=following::input[1]").first(),
    ];

    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) {
        return true;
      }
    }

    return false;
  }

  private async clickAddUserButtonWithDom() {
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
          style.visibility !== "hidden" &&
          style.pointerEvents !== "none"
        );
      };

      const addUserText = Array.from(document.querySelectorAll<HTMLElement>("button, a, p, span, div"))
        .find((element) => /^Add User$/i.test(normalize(element.innerText || element.textContent)) && visible(element));
      const button = addUserText?.closest<HTMLElement>("button, a, [role='button']");
      const target = button || addUserText;
      if (!target) {
        return false;
      }

      target.scrollIntoView({ block: "center", inline: "center" });
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      target.click();
      return true;
    }).catch(() => false);
  }

  private async clickAddUserButtonWithMouse() {
    const addUserButton = this.page.locator("button").filter({ hasText: /^Add User$/i }).first();
    if (!(await addUserButton.isVisible().catch(() => false))) {
      return false;
    }

    await addUserButton.scrollIntoViewIfNeeded().catch(() => {});
    const box = await addUserButton.boundingBox().catch(() => null);
    if (!box) {
      return false;
    }

    await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    return true;
  }

  private async isReady() {
    const currentUrl = this.page.url();
    const inUserManagementRoute = /user(-| )management|\/users(?:\/)?$|\/users\?|user-managment|user-management/i.test(currentUrl);
    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));

    if (/Lost World|Error code:\s*404/i.test(bodyText)) {
      return false;
    }

    const hasHeading = await this.page
      .getByRole("heading", { name: /users?|user management|team|members/i })
      .first()
      .isVisible()
      .catch(() => false);
    if (hasHeading) {
      return true;
    }

    if (
      inUserManagementRoute &&
      /add user|create user|new user|invite user|user management|members|team/i.test(bodyText)
    ) {
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
    await ensureAuthenticatedSession(this.page, app, "/admin/developer/cpms/manage-construction");
  }
}
