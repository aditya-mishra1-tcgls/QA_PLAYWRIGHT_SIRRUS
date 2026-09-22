import { test } from "../../support/test";
import { UserManagementPage } from "../../pages";
import { createAutomationUser, getConfiguredAdminCredential, openUserManagement } from "../../support/users";

async function openUserManagementPage(...args: Parameters<typeof openUserManagement>) {
  const [page, app] = args;
  const users = new UserManagementPage(page);
  await openUserManagement(page, app);
  return users;
}

function buildAddUserData(prefix: string) {
  const suffix = Date.now().toString().slice(-6);
  const normalizedPrefix = prefix.toLowerCase();

  return {
    firstName: `${prefix}${suffix}`,
    lastName: "User",
    mobileNumber: `${prefix === "Project" ? "8" : "9"}${suffix.padStart(9, "0").slice(0, 9)}`,
    email: `${normalizedPrefix}${suffix}@tt.in`,
    city: "demo city",
  };
}

test.describe("Admin user management", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 120000));

  test("Admin creates an automation user with email and password", async ({ page, app }) => {
    const adminCredential = getConfiguredAdminCredential(app);

    test.info().annotations.push({
      type: "admin-login-page",
      description: adminCredential.loginPage,
    });

    await createAutomationUser(page, app);
  });

  test("Add/edit users multiple times consecutively", async ({ page, app }) => {
    const users = new UserManagementPage(page);
    const user = await createAutomationUser(page, app);

    await users.expectOneAddAndTwoEditsDoNotDuplicateOrCorruptUser(user.email);
  });

  test("Add User button opens the Add User form", async ({ page, app }) => {
    const users = await openUserManagementPage(page, app);
    await users.openCreateUserForm();
    await users.expectCreateUserFormVisible();
  });

  test("All roles configured in Role Management are listed in Add User role dropdown", async ({ page, app }) => {
    const users = await openUserManagementPage(page, app);
    await users.openRoleManagement();
    const configuredRoles = await users.readConfiguredRoleNames();

    await users.openUserList();
    await users.openCreateUserForm();
    await users.expectRoleDropdownContainsRoles(configuredRoles);
  });

  test("Reporting Manager dropdown displays existing active users", async ({ page, app }) => {
    const users = await openUserManagementPage(page, app);
    const activeUsers = await users.readActiveUserNamesFromListing();

    await users.openCreateUserForm();
    await users.expectReportingManagerDropdownIncludesActiveUsers(activeUsers);
  });

  test("Projects Allocated dropdown supports selecting multiple projects", async ({ page, app }) => {
    const users = await openUserManagementPage(page, app);

    await users.openCreateUserForm();
    await users.fillAddUserRequiredFields(buildAddUserData("Project"));
    await users.selectMultipleAllocatedProjects(2);
  });

  test("Reset clears entered Add User form values", async ({ page, app }) => {
    const users = await openUserManagementPage(page, app);

    await users.openCreateUserForm();
    await users.fillAddUserRequiredFields(buildAddUserData("Reset"));
    await users.resetAddUserFormAndExpectFieldsCleared();
  });

  test("Add Role opens permission matrix with disabled Save Changes by default", async ({ page, app }) => {
    const users = await openUserManagementPage(page, app);

    await users.openAddRolePanel();
    await users.expectAddRolePanelVisible();
  });

  test("Save Changes remains disabled when role name is blank even after permission selection", async ({ page, app }) => {
    const users = await openUserManagementPage(page, app);

    await users.openAddRolePanel();
    await users.expectRoleSaveDisabledUntilNameAndPermissionSelected();
  });

  test("Duplicate role name shows validation and keeps Save Changes disabled", async ({ page, app }) => {
    const users = await openUserManagementPage(page, app);

    await users.openAddRolePanel();
    await users.expectDuplicateRoleNameValidation("Admin");
  });
});
