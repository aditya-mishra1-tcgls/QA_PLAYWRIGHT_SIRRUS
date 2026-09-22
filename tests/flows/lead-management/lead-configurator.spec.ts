import { test } from "../../support/test";
import { LeadConfiguratorPage } from "../../pages";

test.describe("Lead configurator flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 180000));

  test("Configurator fields match fields available on the add lead form", async ({ page, app }) => {
    const configurator = new LeadConfiguratorPage(page);

    await configurator.openAddLeadFormFromListing(app);
    const leadFormLabels = await configurator.readLeadFormFieldLabels();
    await configurator.closeLeadFormIfOpen();

    await configurator.openLeadFormConfigurator(app);
    await configurator.expectConfiguratorContainsLeadFormFields(leadFormLabels);
  });

  test("Checked lead detail configurator fields are visible on lead details", async ({ page, app }) => {
    const configurator = new LeadConfiguratorPage(page);

    await configurator.openLeadOverviewConfigurator(app);
    await configurator.openFirstLeadDetailsFromListing(app);
    const visibleField = await configurator.pickVisibleLeadDetailFieldFromCurrentPage();
    await configurator.expectCheckedFieldsVisibleOnLeadDetails([visibleField]);
  });

  test("Editing lead detail configurator updates lead detail visibility and restores state", async ({ page, app }) => {
    const configurator = new LeadConfiguratorPage(page);

    await configurator.openLeadOverviewConfigurator(app);
    const field = await configurator.pickToggleableField(true);

    try {
      await configurator.setFieldChecked(field.label, false);
      await configurator.saveConfigurator();

      await configurator.openFirstLeadDetailsFromListing(app);
      await configurator.expectFieldHiddenFromLeadDetails(field.label);
    } finally {
      await configurator.openLeadOverviewConfigurator(app);
      await configurator.setFieldChecked(field.label, field.checked);
      await configurator.saveConfigurator();
    }
  });

  test("Removing a selected lead form field from configurator removes it from add lead form and restores state", async ({
    page,
    app,
  }, testInfo) => {
    const configurator = new LeadConfiguratorPage(page);

    await configurator.openLeadFormConfigurator(app);
    const fieldLabel = await configurator.tryToggleFirstCustomLeadFormField();
    testInfo.skip(!fieldLabel, "No operable custom lead form field toggle is available in this environment.");

    try {
      await configurator.saveConfigurator();

      await configurator.openAddLeadFormFromListing(app);
      await configurator.expectFieldHiddenFromLeadForm(fieldLabel);
      await configurator.closeLeadFormIfOpen();
    } finally {
      await configurator.openLeadFormConfigurator(app);
      await configurator.toggleLeadFormField(fieldLabel);
      await configurator.saveConfigurator();

      await configurator.openAddLeadFormFromListing(app);
      await configurator.expectFieldVisibleOnLeadForm(fieldLabel);
      await configurator.closeLeadFormIfOpen();
    }
  });
});
