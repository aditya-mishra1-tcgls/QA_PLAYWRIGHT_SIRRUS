import { expect, type Page } from "@playwright/test";
import siteVisitFlowConfig from "../data/site-visit-flow.json";

type AppConfig = {
  envName: string;
};

export function getSiteVisitConfig(envName: string) {
  return siteVisitFlowConfig[envName as keyof typeof siteVisitFlowConfig];
}

export async function openLeadDetail(page: Page, detailUrl: string) {
  await page.goto(detailUrl, { waitUntil: "networkidle" });
  await expect(page.getByText("Engagement Intelligence / Lead Profile", { exact: true })).toBeVisible({ timeout: 60000 });
}

export async function openChangeStage(page: Page) {
  await page.getByRole("button", { name: /change stage/i }).click();
  await expect(page.getByText("Choose a stage", { exact: true })).toBeVisible({ timeout: 30000 });
}

export async function assertSiteVisitScheduledLead(page: Page, app: AppConfig) {
  const config = getSiteVisitConfig(app.envName);
  await openLeadDetail(page, config.scheduledLead.detailUrl);

  await expect(page.getByText(`Lead ID : ${config.scheduledLead.leadId}`, { exact: true })).toBeVisible();
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).toContain("Site Visit");
  expect(bodyText).toContain("Scheduled");
  expect(bodyText).toContain("Source :");
  expect(bodyText).toContain(config.scheduledLead.source);
  expect(bodyText).toContain(config.scheduledLead.subSource);

  await openChangeStage(page);
  await expect(page.getByText("Choose a sub stage *", { exact: true })).toBeVisible();
}

export async function assertSiteVisitCompletedLead(page: Page, app: AppConfig) {
  const config = getSiteVisitConfig(app.envName);
  await openLeadDetail(page, config.completedLead.detailUrl);

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
  await openLeadDetail(page, config.revisitLead.detailUrl);

  await expect(page.getByText(`Lead ID : ${config.revisitLead.leadId}`, { exact: true })).toBeVisible();
  await expect(page.getByText(/Lead Status History/i)).toBeVisible();

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).toContain("Scheduled");
  expect(bodyText).toContain("In Progress");
  expect(bodyText).toContain("Visit Done");
  expect(bodyText).toContain("Revisit");
}
