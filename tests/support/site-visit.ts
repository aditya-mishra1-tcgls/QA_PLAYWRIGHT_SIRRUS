import type { Page } from "@playwright/test";
import { test as base } from "@playwright/test";
import siteVisitFlowConfig from "../data/site-visit-flow.json";
import { SiteVisitPage } from "../pages";

type AppConfig = {
  envName: string;
};

async function logStep(title: string) {
  await base.step(title, async () => {});
}

export function getSiteVisitConfig(envName: string) {
  const config = siteVisitFlowConfig[envName as keyof typeof siteVisitFlowConfig];
  if (!config) {
    throw new Error(`Missing site visit seed data for "${envName}" in tests/data/site-visit-flow.json.`);
  }

  return config;
}

export async function openLeadDetail(page: Page, detailPath: string) {
  await logStep("Open lead detail page");
  await new SiteVisitPage(page).openLeadDetail(detailPath);
}

export async function openChangeStage(page: Page) {
  await logStep("Open change stage panel");
  await new SiteVisitPage(page).openChangeStage();
}

export async function assertSiteVisitScheduledLead(page: Page, app: AppConfig) {
  await logStep("Verify scheduled site visit lead");
  await new SiteVisitPage(page).assertScheduledLead(app);
}

export async function assertSiteVisitCompletedLead(page: Page, app: AppConfig) {
  await logStep("Verify completed site visit lead");
  await new SiteVisitPage(page).assertCompletedLead(app);
}

export async function assertSiteVisitHistory(page: Page, app: AppConfig) {
  await logStep("Verify site visit history");
  await new SiteVisitPage(page).assertHistory(app);
}
