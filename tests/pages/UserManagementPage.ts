import { expect, type Page } from "@playwright/test";
import { ProjectSwitcherPage } from "./ProjectSwitcherPage";
import { LoginPage } from "./LoginPage";
import { ensureAuthenticatedSession } from "../support/session";
import { clickFirstVisible, escapeRegex, normalizeText } from "../support/ui-actions";

export type UserManagementAppConfig = {
  baseUrl?: string;
  activeProjectName: string;
  mobileNumber?: string;
  otp?: string;
};

export type UserManagementAuthUser = {
  mobileNumber: string;
  otp: string;
};

export class UserManagementPage {
  private currentApp?: UserManagementAppConfig;

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
    this.currentApp = app;
    await this.page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "domcontentloaded" });
    await ensureAuthenticatedSession(this.page, app, "/admin/developer/cpms/manage-construction");
    app.activeProjectName = await new ProjectSwitcherPage(this.page)
      .ensureActiveProject(app.activeProjectName)
      .catch(() => app.activeProjectName);

    await this.page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "domcontentloaded" });
    await ensureAuthenticatedSession(this.page, app, "/admin/developer/cpms/manage-construction");

    await expect(this.settingsModuleButton).toBeVisible({ timeout: 30000 });
    await this.settingsModuleButton.click();
    await this.openUserManagementFromSettings(app);
    await expect(this.page.getByRole("tab", { name: "User List", exact: true }))
      .toBeVisible({ timeout: 30000 });
    if (await this.page.getByRole("tab", { name: "User List", exact: true })
      .getAttribute("aria-selected")
      .then((value) => value !== "true")
      .catch(() => true)) {
      await this.page.getByRole("tab", { name: "User List", exact: true }).click({ force: true });
    }
    await this.waitForUserTableToSettle();
    await this.waitForUserRowsLoaded();
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

  async expectCreateUserFormVisible() {
    await this.waitForCreateUserForm(60000, true);
    await expect(this.page.locator("#firstName").first()).toBeVisible({ timeout: 30000 });
    await expect(this.page.locator("#lastName").first()).toBeVisible({ timeout: 30000 });
  }

  async openRoleManagement() {
    await this.waitForReady();
    await this.page.getByRole("tab", { name: "Role Management", exact: true }).click();
    await expect(this.page.getByRole("tab", { name: "Role Management", exact: true }))
      .toHaveAttribute("aria-selected", "true", { timeout: 30000 });
    await expect.poll(async () => (await this.readConfiguredRoleNames()).length, { timeout: 30000 })
      .toBeGreaterThan(0);
  }

  async openAddRolePanel() {
    await this.openRoleManagement();
    await this.page.getByRole("button", { name: "Add Role", exact: true }).click();
    await this.expectAddRolePanelVisible();
  }

  async expectAddRolePanelVisible() {
    await expect(this.page.getByRole("textbox", { name: "Enter Role Name" }))
      .toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole("heading", { name: "Lead Permission", exact: true }))
      .toBeVisible({ timeout: 30000 });
    await expect(this.page.getByText("Bulk Lead Upload")).toBeVisible();
    await expect(this.page.getByText("View").first()).toBeVisible();
    await expect(this.page.getByText("Modify").first()).toBeVisible();
    await expect(this.saveRoleButton).toBeDisabled();
  }

  async expectRoleSaveDisabledUntilNameAndPermissionSelected() {
    await expect(this.saveRoleButton).toBeDisabled();
    await this.selectFirstRolePermission();
    await expect(this.saveRoleButton).toBeDisabled();
  }

  async expectDuplicateRoleNameValidation(existingRoleName: string) {
    await this.page.getByRole("textbox", { name: "Enter Role Name" }).fill(existingRoleName);
    await expect(this.page.getByText(/Role already exists/i)).toBeVisible({ timeout: 30000 });
    await this.selectFirstRolePermission();
    await expect(this.saveRoleButton).toBeDisabled();
  }

  async openUserList() {
    await this.page.getByRole("tab", { name: "User List", exact: true }).click();
    await expect(this.page.getByRole("tab", { name: "User List", exact: true }))
      .toHaveAttribute("aria-selected", "true", { timeout: 30000 });
    await this.waitForUserTableToSettle();
    await this.waitForUserRowsLoaded();
  }

  async readConfiguredRoleNames() {
    const names = await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const roleCards = Array.from(document.querySelectorAll<HTMLElement>("div, article, section, li"))
        .filter(visible)
        .map((element) => normalize(element.innerText || element.textContent))
        .filter((text, index, values) =>
          text.length < 260 &&
          /Active Users\s*:\s*\d+/i.test(text) &&
          /Permissions Allotted/i.test(text) &&
          values.indexOf(text) === index
        );

      return roleCards
        .map((text) => normalize(text.split(/Active Users\s*:/i)[0]))
        .filter((name) => name && !/User List|Role Management|Settings|Search/i.test(name));
    });

    return names.filter((name) => !/^Role Management$/i.test(name));
  }

  async readActiveUserNamesFromListing(limit = 5) {
    await this.selectUserStatus("Active");
    const names: string[] = [];
    for (const row of await this.userRows.all()) {
      const cellTexts = (await row.getByRole("cell").allTextContents())
        .map((text) => normalizeText(text))
        .filter(Boolean);
      const name = this.findUserNameCell(cellTexts);
      if (name && !names.includes(name)) {
        names.push(name);
      }
      if (names.length >= limit) {
        break;
      }
    }

    return names;
  }

  async readRoleDropdownOptions() {
    await this.clickAddUserDropdown("Role");
    const options = await this.readOpenDropdownOptions();
    await this.closeDropdownByClickingForm();
    return options;
  }

  async expectRoleDropdownContainsRoles(expectedRoles: string[]) {
    const actualRoles = await this.readRoleDropdownOptions();
    for (const role of expectedRoles) {
      expect(
        actualRoles.some((actualRole) => actualRole.toLowerCase() === role.toLowerCase()),
        `Role dropdown should include configured role '${role}'. Actual options: ${actualRoles.join(", ")}`,
      ).toBeTruthy();
    }
  }

  async readReportingManagerDropdownOptions() {
    await this.clickAddUserDropdown("Reporting Manager");
    const options = await this.readOpenDropdownOptions();
    await this.closeDropdownByClickingForm();
    return options;
  }

  async expectReportingManagerDropdownIncludesActiveUsers(activeUsers: string[]) {
    const managerOptions = await this.readReportingManagerDropdownOptions();
    expect(managerOptions.length, "Reporting Manager dropdown should show selectable users").toBeGreaterThan(0);
    if (activeUsers.length === 0) {
      expect(
        managerOptions.some((option) => /[A-Za-z]/.test(option) && !/^Select here$/i.test(option)),
        `Reporting Manager dropdown should include existing user names. Options: ${managerOptions.join(", ")}`,
      ).toBeTruthy();
      return;
    }

    expect(
      activeUsers.some((userName) =>
        managerOptions.some((option) => option.toLowerCase().startsWith(userName.toLowerCase())),
      ),
      `Reporting Manager dropdown should include at least one active user. Active users: ${activeUsers.join(", ")}. Options: ${managerOptions.join(", ")}`,
    ).toBeTruthy();
  }

  async selectMultipleAllocatedProjects(count = 2) {
    await this.selectDropdownOption("Role", [/^test second owner$/i]);
    await this.selectDropdownOption("Reporting Manager", [/Ankit Narula\s*Admin/i, /Aadi Gala\s*Admin/i, /Aakarsh Yadav\s*Admin/i]);
    await this.clickAddUserDropdown("Projects Allocated");
    const options = (await this.readOpenDropdownOptions())
      .filter((option) => !/^Select here$/i.test(option))
      .filter((option) => !/^All Projects?$/i.test(option))
      .slice(0, count);

    expect(options.length, "Projects Allocated dropdown should contain multiple selectable projects").toBeGreaterThanOrEqual(count);

    const selectedProjects = await this.readSelectedOpenDropdownOptions();
    const allProjectsSelected = selectedProjects.some((project) => /^All Projects?$/i.test(project));
    if (allProjectsSelected) {
      await this.closeDropdownByClickingForm();
      await this.expectMultipleProjectsRetained();
      return options;
    }

    for (const project of options) {
      if (selectedProjects.some((selectedProject) => selectedProject.toLowerCase() === project.toLowerCase())) {
        continue;
      }
      await this.clickDropdownOptionByText(project);
    }

    await this.closeDropdownByClickingForm();
    await this.expectProjectsRetained(options);
    return options;
  }

  async selectCreateUserRequiredDropdowns(options: {
    role?: string;
    reportingManager?: string;
    project?: string;
  } = {}) {
    const role = await this.selectDropdownOption("Role", [
      ...(options.role ? [new RegExp(`^${escapeRegex(options.role)}$`, "i")] : []),
      /^Presales Head Group$/i,
      /^Sales$/i,
      /^User$/i,
    ]);
    const reportingManager = await this.selectDropdownOption("Reporting Manager", [
      ...(options.reportingManager ? [new RegExp(escapeRegex(options.reportingManager), "i")] : []),
      /Aadi Gala\s*Admin/i,
      /Ankit Narula\s*Admin/i,
      /Aakarsh Yadav\s*Admin/i,
    ]);
    const project = await this.selectDropdownOption("Projects Allocated", [
      ...(options.project ? [new RegExp(`^${escapeRegex(options.project)}$`, "i")] : []),
      /^All Projects$/i,
    ]);
    await this.expectProjectsRetained([project]);
    return { role, reportingManager, project };
  }

  async fillAddUserRequiredFields(data: { firstName: string; lastName: string; mobileNumber: string; email: string; city: string }) {
    await this.page.locator("#firstName").fill(data.firstName);
    await this.page.locator("#lastName").fill(data.lastName);
    await this.page.getByRole("textbox", { name: "Enter Mobile Number" }).fill(data.mobileNumber);
    await this.page.locator("#email").fill(data.email);
    const city = this.page.locator("#city");
    if (await city.isVisible().catch(() => false)) {
      await city.fill(data.city);
    }
  }

  async resetAddUserFormAndExpectFieldsCleared() {
    await this.page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(this.page.locator("#firstName")).toHaveValue("");
    await expect(this.page.locator("#lastName")).toHaveValue("");
    await expect(this.page.getByRole("textbox", { name: "Enter Mobile Number" })).toHaveValue("");
    await expect(this.page.locator("#email")).toHaveValue("");
    const city = this.page.locator("#city");
    if (await city.isVisible().catch(() => false)) {
      await expect(city).toHaveValue("");
    }
  }

  private statusTab(status: "Active" | "Inactive") {
    return this.page.getByRole("tab", { name: new RegExp(`^${status} User\\b`, "i") });
  }

  private get userRows() {
    return this.page.getByRole("table").getByRole("row").filter({
      has: this.page.getByRole("cell"),
    });
  }

  private get searchBox() {
    return this.page.getByRole("searchbox").or(
      this.page.getByRole("textbox", { name: /search/i }),
    ).first();
  }

  private get saveRoleButton() {
    return this.page.getByRole("button", { name: "Save Changes", exact: true });
  }

  private paginationButton(pageNumber: number) {
    // Scope to the table/pagination container to exclude the header notification count.
    return this.page.getByRole("table")
      .locator("xpath=ancestor::*[.//select][1]")
      .getByRole("button", { name: String(pageNumber), exact: true });
  }

  async readUserCounts() {
    const readCount = async (status: "Active" | "Inactive") => {
      const tab = this.statusTab(status);
      await expect(tab).toContainText(/\d/);
      const match = (await tab.innerText()).match(/([\d,]+)\s*$/);
      if (!match) throw new Error(`Missing ${status} user count badge`);
      return Number(match[1].replace(/,/g, ""));
    };
    return { active: await readCount("Active"), inactive: await readCount("Inactive") };
  }

  async expectUserCounts(counts: { active: number; inactive: number }) {
    await expect.poll(() => this.readUserCounts(), { timeout: 30000 }).toEqual(counts);
  }

  async readFirstListedUserName() {
    await this.waitForUserTableToSettle();
    for (const row of await this.userRows.all()) {
      const cellTexts = (await row.getByRole("cell").allTextContents())
        .map((text) => normalizeText(text))
        .filter(Boolean);
      const name = this.findUserNameCell(cellTexts);
      if (name) {
        return name;
      }
    }

    throw new Error("Unable to find a searchable user name in the listing.");
  }

  async readFirstListedUserSearchData() {
    await this.waitForUserTableToSettle();
    for (const row of await this.userRows.all()) {
      const cellTexts = (await row.getByRole("cell").allTextContents())
        .map((text) => normalizeText(text))
        .filter(Boolean);
      const rowText = normalizeText(cellTexts.join(" "));
      const email = rowText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
      const mobileMatch = rowText.match(/(?:\+91\s*)?([6-9][\d\s-]{8,}\d)/);
      const mobileDigits = mobileMatch?.[0].replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "") ?? "";
      const mobileNumber = mobileDigits.length >= 10 ? mobileDigits.slice(-10) : "";
      const name = this.findUserNameCell(cellTexts);

      if (name && email && mobileNumber) {
        return {
          name,
          email,
          mobileNumber,
          rowText,
          partialName: this.buildPartialSearchText(name),
          partialEmail: this.buildPartialSearchText(email.split("@")[0] || email),
          partialMobileNumber: mobileNumber.slice(0, 6),
        };
      }
    }

    throw new Error("Unable to find a user row with searchable name, email and mobile number.");
  }

  async readExistingUserSearchValues() {
    const values = {
      name: "",
      email: "",
      mobileNumber: "",
    };
    let pageNumber = 1;

    do {
      await this.waitForVisibleUserRowTexts("User list should load rows before extracting search values");
      for (const row of await this.userRows.all()) {
        const cellTexts = (await row.getByRole("cell").allTextContents())
          .map((text) => normalizeText(text))
          .filter(Boolean);
        const rowText = normalizeText(cellTexts.join(" "));

        values.name ||= this.findUserNameCell(cellTexts);
        values.email ||= rowText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";

        const mobileMatch = rowText.match(/(?:\+91\s*)?([6-9][\d\s-]{8,}\d)/);
        const mobileDigits = mobileMatch?.[0].replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "") ?? "";
        if (!values.mobileNumber && mobileDigits.length >= 10) {
          values.mobileNumber = mobileDigits.slice(-10);
        }

        if (values.name && values.email && values.mobileNumber) {
          return {
            ...values,
            partialName: this.buildPartialSearchText(values.name),
            partialEmail: this.buildPartialSearchText(values.email.split("@")[0] || values.email),
            partialMobileNumber: values.mobileNumber.slice(0, 6),
          };
        }
      }

      const nextPage = this.paginationButton(pageNumber + 1);
      if (!(await nextPage.isVisible().catch(() => false))) {
        break;
      }

      const previousRows = await this.readVisibleUserRowTexts();
      await nextPage.click();
      await expect.poll(() => this.readVisibleUserRowTexts(), { timeout: 30000 }).not.toEqual(previousRows);
      pageNumber += 1;
    } while (pageNumber <= 5);

    throw new Error(`Unable to find reusable user search values. Found: ${JSON.stringify(values)}`);
  }

  async readCurrentUserListingSnapshot() {
    await this.waitForUserTableToSettle();
    return await this.readVisibleUserRowTexts();
  }

  async searchUserList(searchText: string) {
    const previousRows = await this.readVisibleUserRowTexts().catch(() => []);
    await expect(this.searchBox).toBeVisible({ timeout: 30000 });
    await this.searchBox.fill(searchText);
    await expect(this.searchBox).toHaveValue(searchText);
    await expect
      .poll(async () => {
        await this.waitForUserTableToSettle().catch(() => {});
        const rows = await this.readVisibleUserRowTexts().catch(() => []);
        if (rows.length === 0) {
          return false;
        }

        return rows.some((row) => this.rowMatchesSearchText(row, searchText)) &&
          (previousRows.length === 0 || rows.join("\n") !== previousRows.join("\n") ||
            rows.every((row) => this.rowMatchesSearchText(row, searchText)));
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  async expectVisibleUsersMatchSearch(searchText: string) {
    await this.waitForUserTableToSettle();
    const rows = await this.readVisibleUserRowTexts();
    expect(rows.length, `Search '${searchText}' should return matching user rows`).toBeGreaterThan(0);
    for (const row of rows) {
      expect(
        this.rowMatchesSearchText(row, searchText),
        `Visible row should match search '${searchText}': ${row}`,
      ).toBeTruthy();
    }
  }

  async clearUserSearchAndExpectListingRestored(expectedRows: string[]) {
    await expect(this.searchBox).toBeVisible({ timeout: 30000 });
    await this.searchBox.fill("");
    await expect(this.searchBox).toHaveValue("");
    await expect
      .poll(async () => {
        await this.waitForUserTableToSettle().catch(() => {});
        return await this.readVisibleUserRowTexts().catch(() => []);
      }, { timeout: 30000 })
      .toEqual(expectedRows);
  }

  async applyRoleFilterAndExpectOnlyMatchingUsers(roleName = "Admin") {
    await this.selectUserStatus("Active");
    await this.openFilterPanel();
    const selectedRole = await this.selectRoleFilter(roleName);
    const previousRows = await this.readVisibleUserRowTexts().catch(() => []);
    await this.applyFilters();
    await expect(this.page.getByRole("button", { name: /Filter\s*\(\d+\)/i }))
      .toBeVisible({ timeout: 30000 });
    await expect
      .poll(async () => {
        await this.waitForUserTableToSettle().catch(() => {});
        const rows = await this.readVisibleUserRoleValues().catch(() => []);
        return rows.length > 0 &&
          rows.every((role) => this.valuesMatchFilter(role, selectedRole)) &&
          (previousRows.length === 0 || (await this.readVisibleUserRowTexts()).join("\n") !== previousRows.join("\n") ||
            rows.every((role) => this.valuesMatchFilter(role, selectedRole)));
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  async closeFilterPanelWithoutApplyKeepsListingUnchanged(preferredRole = "CRM pre sale") {
    await this.selectUserStatus("Active");
    const defaultRows = await this.readCurrentUserListingSnapshot();
    await this.openFilterPanel();
    await this.selectRoleFilter(preferredRole);
    await this.closeFilterPanelWithBackArrow();
    if (!await this.page.getByRole("button", { name: /^Filter(?:\s*\(\d+\))?$/i }).isVisible().catch(() => false)) {
      await this.openUserList();
      await this.selectUserStatus("Active");
    }
    await expect(this.page.getByRole("button", { name: /^Filter(?:\s*\(\d+\))?$/i }))
      .toBeVisible({ timeout: 30000 });
    await expect
      .poll(async () => {
        await this.waitForUserTableToSettle().catch(() => {});
        return await this.readVisibleUserRowTexts().catch(() => []);
      }, { timeout: 30000 })
      .toEqual(defaultRows);
  }

  async openFirstUserDetailOrEditViewFromListing() {
    await this.selectUserStatus("Active");
    const firstRow = this.userRows.first();
    await expect(firstRow, "User list should contain at least one editable row").toBeVisible({ timeout: 30000 });
    await firstRow.getByRole("cell").first().click({ force: true });
    const openedFromNameCell = await expect
      .poll(async () => await this.isEditableUserFormVisible(), { timeout: 5000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!openedFromNameCell) {
      const editAction = firstRow.getByRole("button", { name: "Edit User", exact: true }).first();
      await expect(editAction, "User row should expose an Edit User action").toBeVisible({ timeout: 30000 });
      await editAction.click({ force: true });
    }

    await expect
      .poll(async () => await this.isEditableUserFormVisible(), { timeout: 30000 })
      .toBeTruthy();
  }

  async selectUserStatus(status: "Active" | "Inactive") {
    await this.statusTab(status).click();
    await expect(this.statusTab(status)).toHaveAttribute("aria-selected", "true");
    await expect(this.statusTab(status === "Active" ? "Inactive" : "Active"))
      .toHaveAttribute("aria-selected", "false");
    await expect(this.page.getByRole("table")).toBeVisible();
    await this.waitForUserTableToSettle();
  }

  async expectStatusListingMatchesBadge(status: "Active" | "Inactive") {
    await this.selectUserStatus(status);
    const counts = await this.readUserCounts();
    const expected = status === "Active" ? counts.active : counts.inactive;
    const action = status === "Active" ? "Deactivate user" : "Reactivate user";
    const opposite = status === "Active" ? "Reactivate user" : "Deactivate user";

    await this.expectVisibleRowsExposeOnlyStatusAction(action, opposite, expected);
    await expect.poll(() => this.readPaginationTotal(), {
      message: `${status} badge should match the user-list pagination total.`,
      timeout: 30000,
    }).toBe(expected);
    await this.expectUserCounts(counts);
  }

  async changeUserStatus(email: string, target: "Active" | "Inactive") {
    const source = target === "Active" ? "Inactive" : "Active";
    const action = target === "Active" ? "Reactivate" : "Deactivate";
    await this.selectUserStatus(source);
    const before = await this.readUserCounts();
    await this.page.getByRole("searchbox").fill(email);
    const row = this.userRows.filter({ has: this.page.getByRole("cell", { name: email, exact: true }) });
    await expect(row).toHaveCount(1, { timeout: 30000 });
    await row.getByRole("button", { name: `${action} user`, exact: true }).click();
    const reason = this.page.getByRole("textbox", { name: /Please provide a reason \(Max/i });
    await reason.fill(`Automation: ${action.toLowerCase()} test user`);
    await expect(this.page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    const confirm = this.page.getByRole("button", { name: action, exact: true });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(reason).toBeHidden({ timeout: 30000 });
    // Search also filters the badges; clear it before comparing global totals.
    await this.page.getByRole("searchbox").fill("");
    await this.expectUserCounts({
      active: before.active + (target === "Active" ? 1 : -1),
      inactive: before.inactive + (target === "Inactive" ? 1 : -1),
    });
    await this.selectUserStatus(target);
    await this.page.getByRole("searchbox").fill(email);
    await expect(row).toHaveCount(1, { timeout: 30000 });
    await expect(row.getByRole("button", {
      name: target === "Active" ? "Deactivate user" : "Reactivate user", exact: true,
    })).toBeVisible();
    await this.page.getByRole("searchbox").fill("");
  }

  async expectUserListed(email: string) {
    const emailTextVisible = await this.page
      .getByText(email, { exact: false })
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (emailTextVisible) {
      return;
    }

    await this.selectUserStatus("Active");
    await this.page.getByRole("searchbox").fill(email);
    await expect(this.userRows.filter({ has: this.page.getByRole("cell", { name: email, exact: true }) }))
      .toHaveCount(1, { timeout: 60000 });
    await this.page.getByRole("searchbox").fill("");
  }

  async updateUserRoleAndExpectReflectedInList(email: string, preferredRoles: RegExp[] = [/^User$/i, /^test second owner$/i]) {
    await this.openEditUserForm(email);
    const selectedRole = await this.selectEditableUserRole(preferredRoles);
    await this.saveEditableUserForm();
    const row = await this.expectSingleUserRowByEmail(email);
    await expect(row).toContainText(selectedRole, { timeout: 30000 });
    await this.page.getByRole("searchbox").fill("");
  }

  async expectSingleUserRowByEmail(email: string) {
    await this.selectUserStatus("Active");
    await this.page.getByRole("searchbox").fill(email);
    const row = this.userRows.filter({ has: this.page.getByRole("cell", { name: email, exact: true }) });
    await expect(row).toHaveCount(1, { timeout: 30000 });
    return row;
  }

  async expectOneAddAndTwoEditsDoNotDuplicateOrCorruptUser(email: string) {
    await this.expectSingleUserRowByEmail(email);
    await this.page.getByRole("searchbox").fill("");

    await this.updateUserRoleAndExpectReflectedInList(email, [/^User$/i, /^test second owner$/i]);
    await this.expectSingleUserRowByEmail(email);
    await this.page.getByRole("searchbox").fill("");

    await this.updateUserRoleAndExpectReflectedInList(email, [/^Presales Head Group$/i, /^Sales$/i]);
    await this.expectSingleUserRowByEmail(email);
    await this.page.getByRole("searchbox").fill("");
  }

  async deactivateActiveUserAndExpectMovedToInactive(email: string) {
    await this.selectUserStatus("Active");
    const before = await this.readUserCounts();
    await this.changeUserStatus(email, "Inactive");
    await this.expectUserCounts({
      active: before.active - 1,
      inactive: before.inactive + 1,
    });
    await this.selectUserStatus("Active");
    await this.page.getByRole("searchbox").fill(email);
    await expect(this.userRows.filter({ has: this.page.getByRole("cell", { name: email, exact: true }) }))
      .toHaveCount(0, { timeout: 30000 });
    await this.page.getByRole("searchbox").fill("");

    await this.selectUserStatus("Inactive");
    await this.page.getByRole("searchbox").fill(email);
    await expect(this.userRows.filter({ has: this.page.getByRole("cell", { name: email, exact: true }) }))
      .toHaveCount(1, { timeout: 30000 });
    await this.page.getByRole("searchbox").fill("");
  }

  async expectPaginatedUserListLoadsWithoutDuplicateOrDataLoss(minimumUsers = 21) {
    await this.selectUserStatus("Active");
    const { active } = await this.readUserCounts();
    expect(active, `Active user list should have at least ${minimumUsers} users for pagination coverage`)
      .toBeGreaterThanOrEqual(minimumUsers);

    await expect.poll(() => this.readPaginationTotal(), {
      message: "Pagination total should match the active user badge before paging.",
      timeout: 30000,
    }).toBe(active);

    const firstPageRows = await this.waitForVisibleUserRowTexts("First active-user page should contain rows");
    const firstPageSet = new Set(firstPageRows);
    const nextPage = this.paginationButton(2);
    await expect(nextPage, "Page 2 should be available for active users").toBeVisible({ timeout: 30000 });
    await nextPage.click();

    await expect.poll(() => this.readVisibleUserRowTexts(), { timeout: 30000 }).not.toEqual(firstPageRows);
    const secondPageRows = await this.waitForVisibleUserRowTexts("Second active-user page should contain rows");
    expect(secondPageRows.length, "Second page should load additional users").toBeGreaterThan(0);

    for (const rowText of secondPageRows) {
      expect(firstPageSet.has(rowText), `Duplicate user row found across page 1 and page 2: ${rowText}`)
        .toBeFalsy();
    }

    await expect.poll(() => this.readPaginationTotal(), {
      message: "Pagination total should remain stable after moving to the next page.",
      timeout: 30000,
    }).toBe(active);
  }

  async expectUnauthorizedUserCannotAccessUserManagement(
    app: Pick<UserManagementAppConfig, "baseUrl">,
    user: UserManagementAuthUser,
  ) {
    if (!app.baseUrl || !user.mobileNumber || !user.otp) {
      throw new Error("User Management unauthorized login credentials were not available.");
    }

    await this.loginFreshAs(app.baseUrl, user);
    await this.expectUserManagementOptionHiddenInSettings();
    await this.expectDirectUserManagementRoutesBlocked();
  }

  private async waitForReady() {
    await expect.poll(() => this.isReady(), { timeout: 60000 }).toBeTruthy();
  }

  private async loginFreshAs(baseUrl: string, user: UserManagementAuthUser) {
    await this.page.context().clearCookies();
    await this.page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await this.page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    }).catch(() => {});

    await new LoginPage(this.page).login({
      baseUrl,
      mobileNumber: user.mobileNumber,
      otp: user.otp,
    });
  }

  private async expectUserManagementOptionHiddenInSettings() {
    await expect(this.page).toHaveURL(/\/admin\/(?!login)/, { timeout: 60000 });

    if (await this.settingsModuleButton.isVisible({ timeout: 15000 }).catch(() => false)) {
      await this.settingsModuleButton.click();
      await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }

    await expect
      .poll(async () => {
        const visibleLinks = await this.page
          .locator('a[href*="user-managment"], a[href*="user-management"]')
          .filter({ hasText: /user management/i })
          .count()
          .catch(() => 0);
        const visibleCards = await this.page
          .locator("a, button, div, li")
          .filter({ hasText: /^User Management\b/i })
          .filter({ hasText: /Create and Manage access of users/i })
          .count()
          .catch(() => 0);

        return visibleLinks + visibleCards;
      }, { timeout: 15000 })
      .toBe(0);
  }

  private async expectDirectUserManagementRoutesBlocked() {
    for (const route of this.knownUserManagementRoutes()) {
      await this.page.goto(route, { waitUntil: "domcontentloaded" }).catch(() => {});
      await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

      const accessState = await expect
        .poll(async () => await this.readUserManagementAccessState(), { timeout: 30000 })
        .toMatchObject({ manageable: false })
        .then(async () => await this.readUserManagementAccessState())
        .catch(async () => await this.readUserManagementAccessState());

      expect(
        accessState.manageable,
        `Restricted user should not manage User Management by direct URL '${route}'. Current URL: ${accessState.url}`,
      ).toBeFalsy();
      expect(
        accessState.blocked,
        `Restricted user should see denial, 404, or redirect for direct URL '${route}'. Current URL: ${accessState.url}`,
      ).toBeTruthy();
    }
  }

  private async readUserManagementAccessState() {
    const userListVisible = await this.page.getByRole("tab", { name: "User List", exact: true })
      .isVisible()
      .catch(() => false);
    const addUserVisible = await this.createUserCandidates[0].isVisible().catch(() => false);
    const tableManageable = await this.page.getByRole("columnheader", { name: /User Name/i })
      .isVisible()
      .catch(() => false);
    const restrictedTextVisible = await this.page
      .getByText(/access denied|unauthorized|not authorized|permission|restricted|forbidden|not allowed|Lost World|Error code:\s*404/i)
      .first()
      .isVisible()
      .catch(() => false);
    const url = this.page.url();
    const redirectedAway = !/user-management|user-managment|\/users/i.test(url);

    return {
      blocked: restrictedTextVisible || redirectedAway,
      manageable: userListVisible || addUserVisible || tableManageable,
      url,
    };
  }

  private async openUserManagementFromSettings(app: UserManagementAppConfig) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.page.waitForLoadState("domcontentloaded").catch(() => {});
      const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
      if (!/Settings|User Management/i.test(bodyText) || /Lost World|Error code:\s*404/i.test(bodyText)) {
        await this.reopenSettingsModule(app);
      }

      if (await this.clickUserManagementCard().catch(() => false) && await this.waitForUserManagementOpened(30000)) {
        return;
      }

      await this.reopenSettingsModule(app);

      const liveUserManagementLink = this.page
        .locator('a[href*="user-managment"], a[href*="user-management"]')
        .filter({ hasText: /user management/i })
        .first();

      if (await liveUserManagementLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await this.openUserManagementHref(await liveUserManagementLink.getAttribute("href"));
        if (await this.waitForUserManagementOpened(30000)) {
          return;
        }
      }

      await this.reopenSettingsModule(app);
    }

    await this.reopenSettingsModule(app).catch(() => {});
    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    throw new Error(`Unable to open User Management. Page text: ${bodyText.slice(0, 500)}`);
  }

  private async waitForUserManagementOpened(timeout = 30000) {
    return await expect
      .poll(async () => {
        const userListVisible = await this.page.getByRole("tab", { name: "User List", exact: true })
          .isVisible()
          .catch(() => false);
        if (userListVisible) {
          return true;
        }

        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        if (/Lost World|Error code:\s*404/i.test(bodyText)) {
          return false;
        }

        const routeLooksRight = /user-management|user-managment/i.test(this.page.url());
        const addUserVisible = await this.createUserCandidates[0].isVisible().catch(() => false);
        return routeLooksRight && (/Active User|Inactive User|User List|Reporting Manager/i.test(bodyText) || addUserVisible);
      }, { timeout })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
  }

  private async openKnownUserManagementRoute() {
    for (const route of this.knownUserManagementRoutes()) {
      await this.page.goto(route, { waitUntil: "domcontentloaded" }).catch(() => {});
      await this.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

      const opened = await this.isReady().catch(() => false);
      if (opened) {
        return true;
      }

      const lostWorld = await this.page.getByText(/Lost World|Error code:\s*404/i).first().isVisible().catch(() => false);
      if (!lostWorld && /user-management|user-managment|\/users/i.test(this.page.url())) {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        if (/User List|Add User|Active User|Inactive User|User Name|Reporting Manager/i.test(bodyText)) {
          return true;
        }
      }
    }

    return false;
  }

  private async reopenSettingsModule(app: UserManagementAppConfig) {
    await this.page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "domcontentloaded" }).catch(() => {});
    await ensureAuthenticatedSession(this.page, app, "/admin/developer/cpms/manage-construction");
    if (!await this.settingsModuleButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await this.page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "domcontentloaded" }).catch(() => {});
      await ensureAuthenticatedSession(this.page, app, "/admin/developer/cpms/manage-construction");
    }
    await expect(this.settingsModuleButton).toBeVisible({ timeout: 30000 });
    await this.settingsModuleButton.click({ force: true });
    await expect
      .poll(async () => await this.visibleUserManagementEntryCount(), {
        timeout: 60000,
      })
      .toBeGreaterThan(0)
      .catch(() => {});
  }

  private async visibleUserManagementEntryCount() {
    const links = await this.page
      .locator('a[href*="user-managment"], a[href*="user-management"]')
      .filter({ hasText: /user management/i })
      .count()
      .catch(() => 0);
    const cards = await this.page
      .locator("a, button, div, li")
      .filter({ hasText: /^User Management\b/i })
      .filter({ hasText: /Create and Manage access of users/i })
      .count()
      .catch(() => 0);

    return links + cards;
  }

  private knownUserManagementRoutes() {
    return [
      "/admin/developer/users",
      "/admin/developer/user-management",
      "/admin/developer/lead-settings/user-managment",
      "/admin/developer/lead-settings/user-management",
      "/admin/developer/settings/users",
      "/admin/developer/cpms/users",
      "/admin/developer/settings/user-management",
      "/admin/developer/settings/user-managment",
    ];
  }

  private async waitForUserTableToSettle() {
    await expect
      .poll(async () => {
        await this.recoverUserManagementSessionIfNeeded();
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        if (/reconnecting|loading|fetching|please wait/i.test(bodyText)) {
          return false;
        }

        const tableVisible = await this.page.getByRole("table").isVisible().catch(() => false);
        if (!tableVisible) {
          return false;
        }

        const noResultsVisible = await this.page
          .getByText(/We did not find any results|No records|No users/i)
          .first()
          .isVisible()
          .catch(() => false);
        if (noResultsVisible) {
          return true;
        }

        const rowTexts = await this.userRows.allTextContents().catch(() => []);
        const meaningfulRows = rowTexts
          .map((text) => normalizeText(text))
          .filter((text) => text && !/^[-\s]+$/.test(text));
        if (meaningfulRows.length === 0) {
          return false;
        }

        const skeletonLike = meaningfulRows.every((text) => text.length < 8 || !/[A-Za-z0-9@]/.test(text));
        return !skeletonLike;
      }, { timeout: 60000 })
      .toBeTruthy();
  }

  private async recoverUserManagementSessionIfNeeded() {
    const loginVisible = await this.page
      .getByRole("textbox", { name: /Enter Mobile Number/i })
      .isVisible()
      .catch(() => false);
    if (!loginVisible) {
      return;
    }

    if (!this.currentApp) {
      return;
    }

    await this.open(this.currentApp);
  }

  private async openUserManagementHref(href: string | null) {
    if (!href) {
      return false;
    }

    const targetPath = href.startsWith("http")
      ? new URL(href).pathname
      : href.startsWith("/")
        ? href
        : href.startsWith("lead-settings/")
          ? `/admin/developer/${href}`
          : new URL(href, this.page.url()).pathname;

    await this.page.goto(targetPath, { waitUntil: "domcontentloaded" });
    return true;
  }

  private async selectFirstRolePermission() {
    const clicked = await this.page.evaluate(() => {
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const toggle = Array.from(document.querySelectorAll<HTMLElement>(".w-\\[79px\\] button"))
        .find(visible);
      if (!toggle) {
        return false;
      }

      toggle.scrollIntoView({ block: "center", inline: "center" });
      toggle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      toggle.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      toggle.click();
      return true;
    }).catch(() => false);

    expect(clicked, "At least one role permission toggle should be selectable").toBeTruthy();
  }

  private async openEditUserForm(email: string) {
    await this.selectUserStatus("Active");
    await this.page.getByRole("searchbox").fill(email);
    const row = this.userRows.filter({ has: this.page.getByRole("cell", { name: email, exact: true }) });
    await expect(row).toHaveCount(1, { timeout: 30000 });

    const namedEditAction = row.getByRole("button", { name: /edit/i }).first();
    if (await namedEditAction.isVisible().catch(() => false)) {
      await namedEditAction.click({ force: true });
    } else {
      const clicked = await row.evaluate((element) => {
        const visible = (target: HTMLElement) => {
          const rect = target.getBoundingClientRect();
          const style = window.getComputedStyle(target);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        };
        const buttons = Array.from(element.querySelectorAll<HTMLElement>("button"))
          .filter((button) => visible(button) && !/deactivate|reactivate/i.test(button.innerText || button.textContent || ""));
        const target = buttons.at(-1);
        if (!target) {
          return false;
        }
        target.click();
        return true;
      }).catch(() => false);
      expect(clicked, "Editable user row should expose an edit action").toBeTruthy();
    }

    await expect
      .poll(async () => await this.isEditableUserFormVisible(), { timeout: 30000 })
      .toBeTruthy();
  }

  private async openFilterPanel() {
    await expect(this.page.getByRole("button", { name: /^Filter(?:\s*\(\d+\))?$/i }))
      .toBeVisible({ timeout: 30000 });
    await this.page.getByRole("button", { name: /^Filter(?:\s*\(\d+\))?$/i }).click();
    await expect(this.page.getByRole("button", { name: "Select Role", exact: true }))
      .toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole("button", { name: "Select Reporting Manager", exact: true }))
      .toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole("button", { name: "Select Projects Allocated", exact: true }))
      .toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole("button", { name: "Clear Filters", exact: true }))
      .toBeVisible({ timeout: 30000 });
  }

  private async selectRoleFilter(preferredRole: string) {
    await this.page.getByRole("button", { name: "Select Role", exact: true }).click();
    const search = this.page.getByRole("textbox", { name: "Search", exact: true });
    if (await search.isVisible().catch(() => false)) {
      await search.fill(preferredRole);
    }

    const preferred = this.page.getByRole("button", { name: preferredRole, exact: true }).first();
    if (await preferred.isVisible({ timeout: 5000 }).catch(() => false)) {
      await preferred.click();
      return preferredRole;
    }

    if (await search.isVisible().catch(() => false)) {
      await search.fill("");
    }
    const options = (await this.readOpenDropdownOptions())
      .filter((option) => !/^Select Role$/i.test(option));
    const fallback = options.find((option) => !/^Select/i.test(option)) || options[0];
    expect(fallback, "Role filter dropdown should expose at least one role").toBeTruthy();
    await this.clickDropdownOptionByText(fallback);
    return fallback;
  }

  private async applyFilters() {
    const apply = this.page.getByRole("button", { name: "Apply", exact: true });
    await expect(apply).toBeEnabled({ timeout: 30000 });
    await apply.click();
    await this.waitForUserTableToSettle();
  }

  private async closeFilterPanelWithBackArrow() {
    const clicked = await clickFirstVisible([
      this.page.locator(".w-\\[34px\\]").first(),
      this.page.locator("#root-modal").locator("button").first(),
      this.page.getByRole("button", { name: /back|close/i }).first(),
    ], "close filter panel", { force: true }).then(() => true).catch(() => false);
    if (!clicked) {
      await this.page.keyboard.press("Escape");
    }
    await expect(this.page.getByRole("button", { name: "Select Role", exact: true }))
      .toBeHidden({ timeout: 10000 })
      .catch(() => {});
  }

  private async readVisibleUserRoleValues() {
    await this.waitForUserTableToSettle();
    const roles: string[] = [];
    for (const row of await this.userRows.all()) {
      const role = normalizeText(await row.getByRole("cell").nth(1).innerText().catch(() => ""));
      if (role) {
        roles.push(role);
      }
    }

    return roles;
  }

  private async isEditableUserFormVisible() {
    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    return /Edit User|User Details|Add User Details|Role\s*\*|Reporting Manager\s*\*/i.test(bodyText) &&
      await this.page.getByText(/^Role\s*\*?$/i).first().isVisible().catch(() => false);
  }

  private async selectEditableUserRole(preferredRoles: RegExp[]) {
    await this.clickAddUserDropdown("Role");
    const options = await this.readOpenDropdownOptions();
    const selectedRole = options.find((role) => preferredRoles.some((preferredRole) => preferredRole.test(role))) ||
      options.find((role) => !/admin/i.test(role)) ||
      options[0];
    expect(selectedRole, "Editable Role dropdown should expose selectable roles").toBeTruthy();
    await this.clickDropdownOptionByText(selectedRole);
    await this.closeDropdownByClickingForm();
    return selectedRole;
  }

  private async saveEditableUserForm() {
    const save = this.page.getByRole("button", { name: /save|submit|update/i }).last();
    await expect(save).toBeVisible({ timeout: 30000 });
    await expect(save).toBeEnabled({ timeout: 30000 });
    await save.click({ force: true });
    await expect
      .poll(async () => {
        const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        return /success|updated|saved|User List/i.test(bodyText);
      }, { timeout: 30000 })
      .toBeTruthy();
  }

  private async clickAddUserDropdown(label: string) {
    await this.expectCreateUserFormVisible();
    let clicked = false;
    if (/Projects Allocated/i.test(label)) {
      const remainingSelectHere = this.page.getByRole("button", { name: "Select here", exact: true }).first();
      if (await remainingSelectHere.isVisible().catch(() => false)) {
        const box = await remainingSelectHere.boundingBox().catch(() => null);
        if (box) {
          await this.page.mouse.click(box.x + box.width - 30, box.y + box.height / 2);
        } else {
          await remainingSelectHere.click({ force: true });
        }
        clicked = true;
      } else {
        const projectLabel = this.page.getByText(/^Projects Allocated\s*\*$/i).first();
        const labelBox = await projectLabel.boundingBox().catch(() => null);
        if (labelBox) {
          await this.page.mouse.click(labelBox.x + Math.max(labelBox.width + 260, 420), labelBox.y + 34);
          clicked = true;
        }
      }
    }

    clicked ||= await this.clickAddUserDropdownByLabel(label);
    if (!clicked) {
      const dropdown = this.page
        .getByText(new RegExp(`^${label}\\s*\\*?$`, "i"))
        .locator("xpath=following::button[1]")
        .first();
      await expect(dropdown, `${label} dropdown should be visible`).toBeVisible({ timeout: 30000 });
      await dropdown.scrollIntoViewIfNeeded().catch(() => {});
      await dropdown.click({ force: true });
    }

    const hasOptions = await expect
      .poll(async () => (await this.readOpenDropdownOptions()).length, { timeout: 5000 })
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);

    if (!hasOptions) {
      const dropdown = this.page
        .getByText(new RegExp(`^${label}\\s*\\*?$`, "i"))
        .locator("xpath=following::button[1]")
        .first();
      await dropdown.scrollIntoViewIfNeeded().catch(() => {});
      await dropdown.click({ force: true }).catch(() => {});
      await this.page.keyboard.press("ArrowDown").catch(() => {});
    }

    await expect.poll(async () => (await this.readOpenDropdownOptions()).length, { timeout: 15000 })
      .toBeGreaterThan(0);
  }

  private async clickAddUserDropdownByLabel(label: string) {
    return await this.page.evaluate((targetLabel) => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const labelPattern = new RegExp(`^${targetLabel}\\s*\\*?\\s*Select here$`, "i");
      const container = Array.from(document.querySelectorAll<HTMLElement>("div"))
        .filter((element) => visible(element) && labelPattern.test(normalize(element.innerText || element.textContent)))
        .sort((left, right) =>
          normalize(left.innerText || left.textContent).length -
          normalize(right.innerText || right.textContent).length,
        )[0];

      const button = container?.querySelector<HTMLElement>("button");
      if (!button) {
        return false;
      }

      button.scrollIntoView({ block: "center", inline: "center" });
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      button.click();
      return true;
    }, escapeRegex(label)).catch(() => false);
  }

  private async readOpenDropdownOptions() {
    return await this.page
      .locator("button, [role='option'], [role='menuitem']")
      .evaluateAll((elements) => {
        const normalize = (value: string | null | undefined) =>
          (value ?? "").replace(/\s+/g, " ").trim();
        const optionText = (value: string | null | undefined) =>
          normalize(value).replace(/^✓\s*/, "");
        const visible = (element: Element) => {
          const htmlElement = element as HTMLElement;
          const rect = htmlElement.getBoundingClientRect();
          const style = window.getComputedStyle(htmlElement);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };

        return Array.from(new Set(elements
          .filter((element) => {
            if (!visible(element)) {
              return false;
            }

            const className = (element as HTMLElement).className?.toString() ?? "";
            const text = normalize(element.textContent);
            const role = element.getAttribute("role") ?? "";
            const ariaSelected = element.getAttribute("aria-selected") ?? "";
            const isDropdownOption =
              /option|menuitem/i.test(role) ||
              (/h-\[34px\]/.test(className) && /text-left/.test(className)) ||
              (/text-left/.test(className) && text.length < 90 && !/^(Reset|Submit|Cancel)$/i.test(text)) ||
              ariaSelected === "false";
            return isDropdownOption;
          })
          .map((element) => optionText(element.textContent))
          .filter((text) =>
            text &&
            !/^Search$/i.test(text) &&
            !/^Select here$/i.test(text) &&
            !/^Reset$/i.test(text) &&
            !/^Submit$/i.test(text) &&
            !/^Cancel$/i.test(text) &&
            !/^Add User$/i.test(text) &&
            !/Settings\s*>\s*Add User/i.test(text)
          )));
      })
      .catch(() => []);
  }

  private async readSelectedOpenDropdownOptions() {
    return await this.page
      .locator("button, [role='option'], [role='menuitem']")
      .evaluateAll((elements) => {
        const normalize = (value: string | null | undefined) =>
          (value ?? "").replace(/\s+/g, " ").trim();
        const optionText = (value: string | null | undefined) =>
          normalize(value).replace(/^✓\s*/, "");
        const visible = (element: Element) => {
          const htmlElement = element as HTMLElement;
          const rect = htmlElement.getBoundingClientRect();
          const style = window.getComputedStyle(htmlElement);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };

        return Array.from(new Set(elements
          .filter((element) => {
            if (!visible(element)) {
              return false;
            }

            const text = normalize(element.textContent);
            return /^✓\s*\S/.test(text) || element.getAttribute("aria-selected") === "true";
          })
          .map((element) => optionText(element.textContent))
          .filter((text) => text && !/^Search$/i.test(text))));
      })
      .catch(() => []);
  }

  private async selectDropdownOption(label: string, preferredOptions: RegExp[] = []) {
    await this.clickAddUserDropdown(label);
    const options = await this.readOpenDropdownOptions();
    const option = options.find((candidate) =>
      preferredOptions.some((pattern) => pattern.test(candidate)),
    ) || options.find((candidate) => !/^User$/i.test(candidate)) || options[0];
    expect(option, `${label} dropdown should have at least one option`).toBeTruthy();
    await this.clickDropdownOptionByText(option);
    await this.closeDropdownByClickingForm();
    return option;
  }

  private async clickDropdownOptionByText(option: string) {
    const clicked = await this.page.evaluate((targetOptionText) => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const normalizedOptionText = (value: string | null | undefined) =>
        normalize(value).replace(/^✓\s*/, "");
      const compact = (value: string | null | undefined) => normalizedOptionText(value).replace(/\s+/g, "").toLowerCase();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const target = Array.from(document.querySelectorAll<HTMLElement>("button"))
        .find((button) =>
          visible(button) &&
          (
            (/h-\[34px\]/.test(button.className.toString()) && /text-left/.test(button.className.toString())) ||
            button.getAttribute("role") === "option" ||
            button.getAttribute("role") === "menuitem" ||
            compact(button.innerText || button.textContent || "") === compact(targetOptionText)
          ) &&
          compact(button.innerText || button.textContent || "") === compact(targetOptionText)
        );

      if (!target) {
        return false;
      }

      target.scrollIntoView({ block: "center", inline: "center" });
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      target.click();
      return true;
    }, option).catch(() => false);

    expect(clicked, `Dropdown option '${option}' should be clickable`).toBeTruthy();
  }

  private async closeDropdownByClickingForm() {
    await this.page.locator("#firstName").click({ force: true }).catch(() => {});
  }

  private async expectProjectsRetained(projects: string[]) {
    const formText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    for (const project of projects) {
      const normalizedProject = normalizeText(project);
      const singularProject = normalizedProject.replace(/\bProjects\b/gi, "Project");
      expect(
        formText.includes(normalizedProject) || formText.includes(singularProject),
        `Selected project '${project}' should remain visible in Add User form. Form text: ${formText}`,
      ).toBeTruthy();
    }
  }

  private async expectMultipleProjectsRetained() {
    await expect
      .poll(async () => {
        const formText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
        const projectsSection = formText.match(/Projects Allocated\s*\*\s*(.+?)\s*City\b/i)?.[1] ?? formText;
        return /\+\d+/.test(projectsSection) || /,\s*\S/.test(projectsSection) || /All Projects?/i.test(projectsSection);
      }, { timeout: 15000 })
      .toBeTruthy();
  }

  private async visibleUserActionCount(action: string) {
    return await this.page
      .getByRole("button", { name: action, exact: true })
      .evaluateAll((buttons) =>
        buttons.filter((button) => {
          const rect = button.getBoundingClientRect();
          const style = window.getComputedStyle(button);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        }).length,
      )
      .catch(() => 0);
  }

  private async expectVisibleRowsExposeOnlyStatusAction(action: string, opposite: string, expectedTotal: number) {
    await this.waitForUserTableToSettle();

    if (expectedTotal === 0) {
      await expect(this.page.getByText(/We did not find any results|No records|No users/i).first())
        .toBeVisible({ timeout: 30000 });
      await expect(this.page.getByRole("button", { name: action, exact: true })).toHaveCount(0);
      return;
    }

    await expect
      .poll(async () => await this.visibleUserActionCount(action), { timeout: 60000 })
      .toBeGreaterThan(0);
    await expect(this.page.getByRole("button", { name: opposite, exact: true })).toHaveCount(0);

    const rowsWithExpectedAction = this.userRows.filter({
      has: this.page.getByRole("button", { name: action, exact: true }),
    });
    await expect(this.userRows).toHaveCount(await rowsWithExpectedAction.count());
  }

  private async readPaginationTotal() {
    await this.waitForUserTableToSettle();
    const bodyText = normalizeText(await this.page.locator("body").innerText().catch(() => ""));
    const match = bodyText.match(/Showing\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)/i);
    if (match) {
      return Number(match[1].replace(/,/g, ""));
    }

    const rows = await this.readVisibleUserRowTexts().catch(() => []);
    return rows.length;
  }

  private async readVisibleUserRowTexts() {
    const rows = await this.userRows.allTextContents();
    return rows
      .map((text) => normalizeText(text))
      .filter((text) => text && /[A-Za-z0-9@]/.test(text));
  }

  private async waitForVisibleUserRowTexts(message: string) {
    let rows: string[] = [];
    await expect
      .poll(async () => {
        await this.waitForUserTableToSettle().catch(() => {});
        rows = await this.readVisibleUserRowTexts().catch(() => []);
        return rows.length;
      }, { timeout: 30000, message })
      .toBeGreaterThan(0);
    return rows;
  }

  private async waitForUserRowsLoaded() {
    await this.waitForVisibleUserRowTexts("User Management list should load visible user rows");
  }

  private buildPartialSearchText(value: string) {
    const normalized = normalizeText(value);
    if (normalized.length <= 5) {
      return normalized;
    }

    return normalized.slice(0, Math.min(6, normalized.length)).trim();
  }

  private rowMatchesSearchText(rowText: string, searchText: string) {
    const row = normalizeText(rowText).toLowerCase();
    const search = normalizeText(searchText).toLowerCase();
    const rowDigits = row.replace(/\D/g, "");
    const searchDigits = search.replace(/\D/g, "");

    return row.includes(search) || (!!searchDigits && rowDigits.includes(searchDigits));
  }

  private valuesMatchFilter(actual: string, expected: string) {
    return normalizeText(actual).toLowerCase() === normalizeText(expected).toLowerCase();
  }

  private findUserNameCell(cellTexts: string[]) {
    const text = cellTexts.find((value) =>
      /[A-Za-z]/.test(value) &&
      !/@/.test(value) &&
      !/(presales|sales|manager|head|active|inactive|deactivate|reactivate|\d{4}|sept|jan|feb|mar|apr|may|jun|jul|aug|oct|nov|dec)/i.test(value) &&
      !/[6-9][\d\s-]{8,}\d/.test(value)
    ) ?? "";

    return text
      .replace(/\b(Admin|User|Manager|Executive|Group)$/i, "")
      .trim();
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
}
