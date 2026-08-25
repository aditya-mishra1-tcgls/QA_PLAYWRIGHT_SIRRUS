import { chromium } from "playwright";
import leadFlowConfig from "../tests/data/lead-flow.json" with { type: "json" };
import siteVisitFlowConfig from "../tests/data/site-visit-flow.json" with { type: "json" };

const envName = process.env.TEST_ENV || "uat";
const leadConfig = leadFlowConfig[envName];
const siteVisitConfig = siteVisitFlowConfig[envName];

function randomDigits(length) {
  const min = 10 ** (length - 1);
  const max = (10 ** length) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

async function login(page) {
  await page.goto("https://uat.sirrus.ai/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("link", { name: /log in/i }).click();
  await page.locator("#mobile_number").fill("9456888501");
  await page.getByRole("button", { name: "Continue" }).click();
  const otpInputs = page.locator('input[inputmode="numeric"]');
  for (const [index, digit] of ["1", "2", "3", "4"].entries()) {
    await otpInputs.nth(index).fill(digit);
  }
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/admin\/(?!login)/, { timeout: 60000 });
}

function dropdownFor(page, label) {
  return page.getByText(label, { exact: true }).locator("xpath=following::button[1]");
}

async function chooseOption(page, preferredOptions = []) {
  const optionLocator = page.locator('#root-modal button[class*="text-left"], #root-modal button[class*="hover:text-gray-300"]');
  await optionLocator.first().waitFor({ state: "visible", timeout: 10000 });

  const texts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("#root-modal button"))
      .filter((button) => button.className.includes("text-left") || button.className.includes("hover:text-gray-300"))
      .map((button) => button.textContent?.trim())
      .filter(Boolean);
  });

  const selected = preferredOptions.find((option) => texts.includes(option)) || texts[0];
  if (!selected) {
    throw new Error("No dropdown options available.");
  }

  await optionLocator.filter({ hasText: selected }).first().click({ force: true });
  await page.waitForTimeout(500);
  return selected;
}

async function createLead(page) {
  const fullName = `${leadConfig.fullNamePrefix} ${randomDigits(4)}`;
  const whatsappNumber = `9${randomDigits(9)}`;

  await page.goto("https://uat.sirrus.ai/admin/developer/cpms/manage-construction", { waitUntil: "networkidle", timeout: 60000 });
  await page.locator("button").nth(2).click();
  await page.getByRole("button", { name: /manage leads/i }).click();
  await page.waitForURL(/engagement-intelligence\/manage-leads/, { timeout: 60000 });

  await page.getByText("Add Lead", { exact: true }).click();
  await page.locator("#fullName").fill(fullName);

  await dropdownFor(page, "Project Name *").click();
  await chooseOption(page, [leadConfig.projectName]);

  await dropdownFor(page, "Source *").click();
  await chooseOption(page, leadConfig.fallbackSourcePreferences);

  await dropdownFor(page, "Sub Source *").click();
  await chooseOption(page);

  await page.locator("#whatsAppNumber").fill(whatsappNumber);
  await page.locator("#sourceCategory").fill(leadConfig.sourceCategory);
  await page.locator("#companyName").fill(leadConfig.companyName);

  const saveButton = page.getByRole("button", { name: /^save$/i });
  await saveButton.click();
  await page.getByText("Lead Form", { exact: true }).waitFor({ state: "hidden", timeout: 60000 }).catch(() => {});

  return { fullName, whatsappNumber };
}

async function openExistingVisitDoneLead(page) {
  await page.goto(siteVisitConfig.completedLead.detailUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("button", { name: /change stage/i }).click();
}

const browser = await chromium.launch({ headless: false, slowMo: 300 });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

try {
  await login(page);
  const lead = await createLead(page);
  console.log(`Created lead attempt: ${lead.fullName}`);
  await page.waitForTimeout(2000);
  await openExistingVisitDoneLead(page);
  await page.waitForTimeout(10000);
} catch (error) {
  console.error(error);
  await page.waitForTimeout(15000);
  throw error;
}
