import { expect, type Locator, type Page } from "@playwright/test";
import siteVisitFlowConfig from "../data/site-visit-flow.json";

type AppConfig = {
  envName: string;
};

const FALLBACK_RENDER_WAIT_MS = 5000;

async function clickWithFallback(
  locator: Locator,
  page: Page,
  postCheck?: () => Promise<boolean>,
  options?: Parameters<Locator["click"]>[0]
) {
  await locator.click(options);

  if (!postCheck) {
    return;
  }

  const ready = await expect
    .poll(postCheck, { timeout: 1500 })
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);

  if (!ready) {
    await page.waitForTimeout(FALLBACK_RENDER_WAIT_MS);
  }
}

export function getSiteVisitConfig(envName: string) {
  const config = siteVisitFlowConfig[envName as keyof typeof siteVisitFlowConfig];
  if (!config) {
    throw new Error(`Missing site visit seed data for "${envName}" in tests/data/site-visit-flow.json.`);
  }

  return config;
}

export async function openLeadDetail(page: Page, detailPath: string) {
  await page.goto(detailPath, { waitUntil: "networkidle" });
  await expect(page.getByText("Engagement Intelligence / Lead Profile", { exact: true })).toBeVisible({ timeout: 60000 });
}

export async function openChangeStage(page: Page) {
  const stagePanelContent = page.locator("body");

  await clickWithFallback(
    page.getByText("Change Stage", { exact: true }).first(),
    page,
    async () => {
      const bodyText = await stagePanelContent.innerText().catch(() => "");
      return /Status|Open|Qualified|Site Visit|Opportunity|Booked|Dropped/i.test(bodyText);
    },
    { force: true }
  );

  await expect
    .poll(async () => {
      const bodyText = await stagePanelContent.innerText().catch(() => "");
      return /Status|Open|Qualified|Site Visit|Opportunity|Booked|Dropped/i.test(bodyText);
    }, { timeout: 30000 })
    .toBeTruthy();
}

export async function assertSiteVisitScheduledLead(page: Page, app: AppConfig) {
  const config = getSiteVisitConfig(app.envName);
  await openLeadDetail(page, config.scheduledLead.detailPath);

  await expect(page.locator("body")).toContainText(/Lead ID\s*:\s*L\d+/i);
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).toContain("Lead Profile");
  expect(bodyText).toContain("Change Stage");

  await openChangeStage(page);
  await expect(page.getByRole("button", { name: /^site visit$/i })).toBeVisible();
}

export async function assertSiteVisitCompletedLead(page: Page, app: AppConfig) {
  const config = getSiteVisitConfig(app.envName);
  await openLeadDetail(page, config.completedLead.detailPath);

  await expect(page.getByText(`Lead ID : ${config.completedLead.leadId}`, { exact: true })).toBeVisible();
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).toContain("Visit Done");
  await expect(page.getByText("Site Visit Scheduled :", { exact: true })).toBeVisible();

  await openChangeStage(page);
  await expect(page.getByText("Site Visit Completed", { exact: true })).toBeVisible();
  await expect(page.getByText("Visit Start :", { exact: true })).toBeVisible();
  await expect(page.getByText("Visit End :", { exact: true })).toBeVisible();
  await expect(page.getByText("Total Duration:", { exact: true })).toBeVisible();
}

export async function assertSiteVisitHistory(page: Page, app: AppConfig) {
  const config = getSiteVisitConfig(app.envName);
  await openLeadDetail(page, config.revisitLead.detailPath);

  await expect(page.getByText(`Lead ID : ${config.revisitLead.leadId}`, { exact: true })).toBeVisible();
  await expect(page.getByText(/Lead Status History/i)).toBeVisible();

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).toContain("Scheduled");
  expect(bodyText).toContain("In Progress");
  expect(bodyText).toContain("Visit Done");
  expect(bodyText).toContain("Revisit");
}
