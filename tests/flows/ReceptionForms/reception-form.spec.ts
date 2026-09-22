import { test } from "../../support/test";
import { ReceptionFormsPage } from "../../pages";
import { getReceptionFormNonAdminUser } from "../../support/non-admin-users";
import {
  switchSavedAuthStateOrganisation,
  switchSavedAuthStateToReceptionFormsOrg,
} from "../../support/organisation-switch";

test.describe("Reception Forms flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 120000));
  let originalOrganisationId = "";

  test.beforeAll(async ({ app }) => {
    originalOrganisationId = await switchSavedAuthStateToReceptionFormsOrg(app);
  });

  test.afterAll(async ({ app }) => {
    if (originalOrganisationId) {
      await switchSavedAuthStateOrganisation(app, originalOrganisationId);
    }
  });

  test("Verify the Reception Form is loading properly", async ({ page, app }) => {
    const receptionFormsPage = new ReceptionFormsPage(page);

    await receptionFormsPage.open(app);
    await receptionFormsPage.expectReceptionFormLoaded();
  });

  test("Verify user is able to submit reception form successfully", async ({ page, app }) => {
    const receptionFormsPage = new ReceptionFormsPage(page);

    await receptionFormsPage.open(app);
    await receptionFormsPage.submitEnquiryDetails();
    await receptionFormsPage.expectEnquirySubmittedSuccessfully();
  });

  test("Verify the Reset functionality in form", async ({ page, app }) => {
    const receptionFormsPage = new ReceptionFormsPage(page);

    await receptionFormsPage.open(app);
    await receptionFormsPage.fillEnquiryDetails();
    await receptionFormsPage.resetFormAndExpectFieldsReset();
  });

  test("Verify reception form data is retained after browser refresh", async ({ page, app }) => {
    const receptionFormsPage = new ReceptionFormsPage(page);

    await receptionFormsPage.open(app);
    const seed = await receptionFormsPage.fillEnquiryDetails();
    await receptionFormsPage.refreshFormAndExpectDataRetained(seed);
  });

  test("Verify Duplicate functionality if lead is already registered in reception form", async ({ page, app }) => {
    const receptionFormsPage = new ReceptionFormsPage(page);

    await receptionFormsPage.open(app);
    await receptionFormsPage.submitDuplicateLeadAndExpectError();
  });

  test("Permission Verify Login with Non Admin User and check reception form", async ({ page, app }) => {
    const receptionFormsPage = new ReceptionFormsPage(page);
    const nonAdminUser = getReceptionFormNonAdminUser(app.envName);

    await receptionFormsPage.loginFreshAs(app, nonAdminUser);
    await receptionFormsPage.expectReceptionFormsModuleRestricted();
  });
});
