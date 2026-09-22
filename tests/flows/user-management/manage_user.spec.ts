import { test } from "../../support/test";
import { UserManagementPage } from "../../pages";
import { getUnauthorizedUserManagementUser } from "../../support/non-admin-users";
import { createAutomationUser, openUserManagement } from "../../support/users";

test.describe("Manage users", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 240000));

  test("Active User tab is selected and its badge matches only active users", async ({ page, app }) => {
    await openUserManagement(page, app);
    await new UserManagementPage(page).expectStatusListingMatchesBadge("Active");
  });

  test("Inactive User tab is selected and its badge matches only inactive users", async ({ page, app }) => {
    await openUserManagement(page, app);
    await new UserManagementPage(page).expectStatusListingMatchesBadge("Inactive");
  });

  test("User counts update after adding, deactivating and reactivating a user and persist on revisit", async ({ page, app }) => {
    const users = new UserManagementPage(page);
    await openUserManagement(page, app);
    await users.selectUserStatus("Active");
    const before = await users.readUserCounts();
    const user = await createAutomationUser(page, app);
    const added = { active: before.active + 1, inactive: before.inactive };
    const deactivated = { active: before.active, inactive: before.inactive + 1 };

    await test.step("Adding a user increases only the active count", async () => {
      await users.expectUserCounts(added);
      await openUserManagement(page, app);
      await users.expectUserCounts(added);
    });

    await test.step("Deactivation decreases active and increases inactive by one", async () => {
      await users.changeUserStatus(user.email, "Inactive");
      await users.expectUserCounts(deactivated);
      await openUserManagement(page, app);
      await users.expectUserCounts(deactivated);
    });

    await test.step("Reactivation increases active and decreases inactive by one", async () => {
      await users.changeUserStatus(user.email, "Active");
      await users.expectUserCounts(added);
      await openUserManagement(page, app);
      await users.expectUserCounts(added);
    });
  });

  test("User detail edit saves changed role and reflects it in the user list", async ({ page, app }) => {
    const users = new UserManagementPage(page);
    const user = await createAutomationUser(page, app);

    await users.updateUserRoleAndExpectReflectedInList(user.email);
  });

  test("Deactivating an active user moves it to Inactive tab and updates counts", async ({ page, app }) => {
    const users = new UserManagementPage(page);
    const user = await createAutomationUser(page, app);

    await users.deactivateActiveUserAndExpectMovedToInactive(user.email);
  });

  test("Paginated user list loads additional users without duplication or data loss", async ({ page, app }) => {
    await openUserManagement(page, app);
    await new UserManagementPage(page).expectPaginatedUserListLoadsWithoutDuplicateOrDataLoss(21);
  });

  test("Search filters user list by existing full user name", async ({ page, app }) => {
    const users = new UserManagementPage(page);
    await openUserManagement(page, app);
    await users.selectUserStatus("Active");
    const existingUserName = await users.readFirstListedUserName();

    await users.searchUserList(existingUserName);
    await users.expectVisibleUsersMatchSearch(existingUserName);
  });

  test("Search supports partial user name email and mobile number", async ({ page, app }) => {
    const users = new UserManagementPage(page);
    await openUserManagement(page, app);
    await users.selectUserStatus("Active");
    const existingUser = await users.readExistingUserSearchValues();

    for (const searchText of [
      existingUser.partialName,
      existingUser.partialEmail,
      existingUser.partialMobileNumber,
    ]) {
      await users.searchUserList(searchText);
      await users.expectVisibleUsersMatchSearch(searchText);
    }
  });

  test("Clearing user search restores the full user list", async ({ page, app }) => {
    const users = new UserManagementPage(page);
    await openUserManagement(page, app);
    await users.selectUserStatus("Active");
    const defaultRows = await users.readCurrentUserListingSnapshot();
    const existingUserName = await users.readFirstListedUserName();

    await users.searchUserList(existingUserName);
    await users.expectVisibleUsersMatchSearch(existingUserName);
    await users.clearUserSearchAndExpectListingRestored(defaultRows);
  });

  test("Role filter displays only users with the selected role", async ({ page, app }) => {
    await openUserManagement(page, app);
    await new UserManagementPage(page).applyRoleFilterAndExpectOnlyMatchingUsers("Admin");
  });

  test("Closing filter panel without applying keeps the user list unchanged", async ({ page, app }) => {
    await openUserManagement(page, app);
    await new UserManagementPage(page).closeFilterPanelWithoutApplyKeepsListingUnchanged();
  });

  test("Clicking a user row opens the user detail edit view", async ({ page, app }) => {
    await openUserManagement(page, app);
    await new UserManagementPage(page).openFirstUserDetailOrEditViewFromListing();
  });

  test("Non-admin user cannot access User Management from settings or direct URL", async ({ page, app }) => {
    const restrictedUser = getUnauthorizedUserManagementUser(app.envName);

    await new UserManagementPage(page).expectUnauthorizedUserCannotAccessUserManagement(app, restrictedUser);
  });
});
