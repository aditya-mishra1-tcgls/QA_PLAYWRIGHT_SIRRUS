import { test } from "../../support/test";
import { MartechWhatsAppTemplatePage } from "../../pages";

function uniqueName(prefix: string) {
  return `${prefix}${Date.now().toString().slice(-6)}`;
}

test.describe("WhatsApp Whitelisting Feature flow", () => {
  test.setTimeout(Number(process.env.PLAYWRIGHT_TEST_TIMEOUT || 420000));
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page, app }) => {
    const whatsappTemplatePage = new MartechWhatsAppTemplatePage(page);
    await whatsappTemplatePage.openWhatsAppTemplates(app);
  });

  test("Verify that a user can whitelist a valid WhatsApp template and also able to delete it", async ({ page }) => {
    const whatsappTemplatePage = new MartechWhatsAppTemplatePage(page);
    const templateName = uniqueName("TestWhatsAppTemplate");

    await whatsappTemplatePage.createApprovedWhatsAppTemplate(templateName);
    await whatsappTemplatePage.deleteTemplate(templateName);
  });
});
