import type { Page } from "@playwright/test";
import { expect, test as base, type Locator } from "@playwright/test";
import leadFlowConfig from "../data/lead-flow.json";
import { ensureActiveProject } from "./auth";
import { LeadFormPage, LeadListPage, LeadProfilePage } from "../pages";
import { fillWithFallback } from "./ui-actions";

type AppConfig = {
  envName: string;
  baseUrl: string;
  activeProjectName: string;
};

export type LeadSeed = {
  projectName: string;
  fullName: string;
  whatsappNumber: string;
  email: string;
  sourceOfLead?: string;
  subSourceOfLead?: string;
  sourceCategory: string;
  companyName: string;
  preferredLocation: string;
  otherPreferences: string;
};

type EditedLead = {
  previousName: string;
  updatedName: string;
  updatedEmail: string;
};

type AddedRemark = {
  text: string;
};

type CostSheetRenderResult = {
  emptyStateText: string;
};

type ReEnquiryResult = {
  source: string;
  subSource: string;
};

type CommentPanelResult = {
  panelTitle: string;
};

type StageTransition = {
  stage: string;
  remark: string;
};

type SiteVisitOtpMode = "otp" | "skip";
type AppliedStageChange = {
  previousStage: string;
  updatedStage: string;
};

const FALLBACK_RENDER_WAIT_MS = 5000;
const REQUIRED_LEAD_IDENTITY_KEYS = new Set([
  "fullName",
  "projectName",
  "sourceOfLead",
  "subSourceOfLead",
  "whatsAppNumber",
]);
const CORE_LEAD_FIELD_KEYS = new Set([
  "fullName",
  "projectName",
  "sourceOfLead",
  "subSourceOfLead",
  "whatsAppNumber",
]);
const DROPDOWN_OPTION_SELECTOR =
  [
    'button[class*="text-left"]',
    'button[class*="hover:text-gray-300"]',
    '[role="option"]',
    '[role="menuitem"]',
    "[cmdk-item]",
    "[data-radix-collection-item]",
    "li[role]",
    'div[class*="cursor-pointer"]',
  ].join(", ");

type LeadFlowConfigKey = keyof typeof leadFlowConfig;

type LeadFormOption = {
  label?: string;
  value?: string;
};

type LeadFormField = {
  key: string;
  label: string;
  type?: string;
  rank?: number;
  isMandatory?: boolean;
  isVisible?: boolean;
  isActive?: boolean;
  options?: LeadFormOption[];
  config?: {
    datePicker?: boolean;
    disablePastDates?: boolean;
    disableFutureDates?: boolean;
  };
};

type LeadFormSection = {
  name?: string;
  rank?: number;
  isActive?: boolean;
  fields?: LeadFormField[];
};

type LeadFormApiPayload = {
  data?: {
    items?: {
      sections?: LeadFormSection[];
    };
  };
};

type LeadFieldTarget = LeadFormField & {
  normalizedLabel: string;
};

type ElementBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLeadFlowSeed(envName: string) {
  return (
    leadFlowConfig[envName as LeadFlowConfigKey] ??
    leadFlowConfig.uat ??
    leadFlowConfig.qa
  );
}

async function clickWithFallback(
  page: Page,
  locator: Locator,
  postCheck?: () => Promise<boolean>,
  options?: Parameters<Locator["click"]>[0],
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

async function waitForHiddenWithFallback(
  locator: Locator,
  page: Page,
  timeout = 60000,
) {
  const hidden = await locator
    .waitFor({ state: "hidden", timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (hidden) {
    return;
  }

  await page.waitForTimeout(FALLBACK_RENDER_WAIT_MS);
  await expect(locator).not.toBeVisible({ timeout });
}

function randomDigits(length: number) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

function randomAlphaNumeric(length: number) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

function preferStandardLeadSources(sourcePreferences: string[]) {
  return [
    ...sourcePreferences.filter((source) => !/direct\s+site\s+visit/i.test(source)),
    ...sourcePreferences.filter((source) => /direct\s+site\s+visit/i.test(source)),
  ];
}

const CHANGE_STAGE_OPTION_PRIORITY = [
  "Qualified",
  "Contacted",
  "Prospect",
  "Opportunity",
  "Negotiation",
  "Site Visit",
  "Rescheduled",
  "No Show",
  "Dropped",
  "Booked",
  "Cancelled",
  "In Progress",
];

const DUPLICATE_LEAD_PATTERN =
  /already\s*(registered|exists|exist)|duplicate|lead.*already|mobile.*already|phone.*already|whats\s*app.*already|merge/i;

async function logStep(title: string) {
  await base.step(title, async () => {});
}

export function buildLeadSeed(envName: string): LeadSeed {
  const envSeed = getLeadFlowSeed(envName);
  const suffix = randomAlphaNumeric(6);

  return {
    projectName: envSeed.projectName,
    fullName: `${envSeed.fullNamePrefix} ${suffix}`,
    whatsappNumber: `9${randomDigits(9)}`,
    email: `automation.lead.${suffix.toLowerCase()}@example.com`,
    sourceCategory: envSeed.sourceCategory,
    companyName: envSeed.companyName,
    preferredLocation: envSeed.preferredLocation,
    otherPreferences: envSeed.otherPreferences,
  };
}

export async function goToManageLeads(page: Page, app: AppConfig) {
  await logStep("Open manage leads page");
  await new LeadListPage(page).openManageLeads(app);
}

function dropdownFor(page: Page, label: string): Locator {
  const labelRegex = leadFormLabelRegex(label);
  return page
    .locator("#root-modal h3")
    .filter({ hasText: labelRegex })
    .first()
    .locator(
      'xpath=ancestor::div[.//h3 and (.//input or .//textarea or .//button[not(normalize-space(.)="Clear")])][1]//button[not(normalize-space(.)="Clear")]',
    )
    .first();
}

function leadFormLabelRegex(label: string) {
  const normalizedLabel = normalizeFieldLabel(label);
  if (/^source$/i.test(normalizedLabel)) {
    return /^\s*(Source|Source of Lead)\s*\*?\s*$/i;
  }

  if (/^sub source$/i.test(normalizedLabel)) {
    return /^\s*(Sub Source|Sub source of lead)\s*\*?\s*$/i;
  }

  return new RegExp(`^\\s*${escapeRegex(normalizedLabel)}\\s*\\*?\\s*$`, "i");
}

async function locatorBox(locator?: Locator): Promise<ElementBox | null> {
  return (await locator?.boundingBox().catch(() => null)) ?? null;
}

async function waitForDropdownOptions(page: Page, anchor?: Locator) {
  const anchorBox = await locatorBox(anchor);

  await expect
    .poll(() => visibleDropdownOptionTexts(page, anchorBox), {
      timeout: 15000,
    })
    .not.toHaveLength(0);
}

async function dropdownHasVisibleOptions(page: Page, anchor?: Locator) {
  return (await visibleDropdownOptionTexts(page, await locatorBox(anchor)))
    .length > 0;
}

async function openDropdownWithRetry(page: Page, label: string) {
  const dropdown = dropdownFor(page, label);
  await page.waitForTimeout(800);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    // Do not press Escape here: when no option panel is open, it closes the
    // entire Lead Form. Clicking its heading dismisses only a stale panel.
    await page.locator("#root-modal h2, #root-modal h3").first().click({ force: true }).catch(() => {});
    const controlVisible = await dropdown
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (!controlVisible) {
      continue;
    }
    await dropdown.scrollIntoViewIfNeeded().catch(() => {});
    const clicked = await dropdown
      .click({ force: true, timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!clicked) {
      continue;
    }

    const opened = await expect
      .poll(() => dropdownHasVisibleOptions(page, dropdown), {
        intervals: [250, 500, 750, 1000],
        timeout: 10000,
      })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (opened) {
      return dropdown;
    }

    // A few environments render an empty option panel on the first fetch.
    // Closing it forces the component to request and render options again.
    await page.locator("#root-modal h2, #root-modal h3").first().click({ force: true }).catch(() => {});
  }

  throw new Error(`Dropdown "${label}" opened without any visible options after retrying.`);
}

async function chooseFirstOption(
  page: Page,
  preferredOptions: string[] = [],
  anchor?: Locator,
  fallbackToFirstVisible = true,
) {
  const anchorBox = await locatorBox(anchor);
  await waitForDropdownOptions(page, anchor);

  for (const preferredOption of preferredOptions) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (await clickVisibleDropdownOption(page, preferredOption, anchorBox)) {
        return preferredOption;
      }

      if (!(await scrollVisibleDropdownOptions(page, anchorBox))) {
        break;
      }
      await page.waitForTimeout(150);
    }
  }

  if (!fallbackToFirstVisible) {
    const optionTexts = await visibleDropdownOptionTexts(page, anchorBox);
    throw new Error(
      `None of the preferred dropdown options were selected. Preferred: ${preferredOptions.join(", ")}. Visible option texts: ${optionTexts.join(", ")}`,
    );
  }

  const firstVisibleOption = await clickFirstVisibleDropdownOption(page, anchorBox);
  if (!firstVisibleOption) {
    const optionTexts = await visibleDropdownOptionTexts(page, anchorBox);
    throw new Error(
      `No dropdown option found. Visible option texts: ${optionTexts.join(", ")}`,
    );
  }

  return firstVisibleOption;
}

async function visibleDropdownOptionTexts(
  page: Page,
  anchorBox?: ElementBox | null,
) {
  return await page.evaluate(({ box, optionSelector }) => {
    function isExcludedOptionText(text?: string) {
      return (
        !text ||
        text.toLowerCase() === "clear" ||
        text.toLowerCase() === "search" ||
        /^Sort:/i.test(text) ||
        /^(Lead Name|Lead ID|Stage|Source|Sub Source|Create Date|Update Date)$/i.test(text) ||
        /^select here$/i.test(text) ||
        /^(All Leads|New Lead|Contacted|Open|Qualified|Prospect|Virtual Site Visit|Site Visit|Opportunity|Negotiation|EOI|Booked|Is a CP|Dropped|Unqualified)\s*\d+$/i.test(text) ||
        /^(Hot|Warm|Cold)\s*\(\d+\)$/i.test(text) ||
        /^(Filter|Add Lead|Lead Dashboard|Lead Listing|Lead Reports|Manage Leads)$/i.test(text)
      );
    }

    function isNearAnchor(rect: DOMRect) {
      return !box ||
        (rect.top >= box.y + box.height - 12 &&
          rect.left <= box.x + box.width + 160 &&
          rect.right >= box.x - 160);
    }

    function isVisibleOption(element: HTMLElement) {
      const text = element.textContent?.replace(/\s+/g, " ").trim();
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        !element.closest("table, thead, tbody, tfoot, tr, th, td") &&
        Boolean(text) &&
        !isExcludedOptionText(text) &&
        (!box || isNearAnchor(rect)) &&
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    }

    const options = Array.from(document.querySelectorAll<HTMLElement>(optionSelector))
      .filter(isVisibleOption);
    const anchoredOptions = options.filter((element) => isNearAnchor(element.getBoundingClientRect()));

    return (anchoredOptions.length ? anchoredOptions : options)
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim())
      .filter((text): text is string => Boolean(text));
  }, { box: anchorBox ?? null, optionSelector: DROPDOWN_OPTION_SELECTOR });
}

async function clickVisibleDropdownOption(
  page: Page,
  selectedText: string,
  anchorBox?: ElementBox | null,
) {
  return await page.evaluate(({ optionText, box, optionSelector }) => {
    function isNearAnchor(rect: DOMRect) {
      return !box ||
        (rect.top >= box.y + box.height - 12 &&
          rect.left <= box.x + box.width + 160 &&
          rect.right >= box.x - 160);
    }

    const options = Array.from(
      document.querySelectorAll<HTMLElement>(optionSelector),
    )
      .filter((element) => {
        const text = element.textContent?.replace(/\s+/g, " ").trim();
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          !element.closest("table, thead, tbody, tfoot, tr, th, td") &&
          text === optionText &&
          (!box || isNearAnchor(rect)) &&
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      })
      .sort((left, right) => {
        const leftAnchored = isNearAnchor(left.getBoundingClientRect()) ? 1 : 0;
        const rightAnchored = isNearAnchor(right.getBoundingClientRect()) ? 1 : 0;
        if (leftAnchored !== rightAnchored) {
          return rightAnchored - leftAnchored;
        }

        const leftZIndex = Number(window.getComputedStyle(left).zIndex) || 0;
        const rightZIndex = Number(window.getComputedStyle(right).zIndex) || 0;
        return rightZIndex - leftZIndex;
      });

    const target = options[0];
    if (!target) {
      return false;
    }

    target.click();
    return true;
  }, { optionText: selectedText, box: anchorBox ?? null, optionSelector: DROPDOWN_OPTION_SELECTOR });
}

async function clickFirstVisibleDropdownOption(
  page: Page,
  anchorBox?: ElementBox | null,
) {
  return await page.evaluate(({ box, optionSelector }) => {
    function isExcludedOptionText(text?: string) {
      return (
        !text ||
        text.toLowerCase() === "clear" ||
        text.toLowerCase() === "search" ||
        /^Sort:/i.test(text) ||
        /^(Lead Name|Lead ID|Stage|Source|Sub Source|Create Date|Update Date)$/i.test(text) ||
        /^select here$/i.test(text) ||
        /^(All Leads|New Lead|Contacted|Open|Qualified|Prospect|Virtual Site Visit|Site Visit|Opportunity|Negotiation|EOI|Booked|Is a CP|Dropped|Unqualified)\s*\d+$/i.test(text) ||
        /^(Hot|Warm|Cold)\s*\(\d+\)$/i.test(text) ||
        /^(Filter|Add Lead|Lead Dashboard|Lead Listing|Lead Reports|Manage Leads)$/i.test(text)
      );
    }

    function isNearAnchor(rect: DOMRect) {
      return !box ||
        (rect.top >= box.y + box.height - 12 &&
          rect.left <= box.x + box.width + 160 &&
          rect.right >= box.x - 160);
    }

    const options = Array.from(
      document.querySelectorAll<HTMLElement>(optionSelector),
    ).filter((element) => {
      const text = element.textContent?.replace(/\s+/g, " ").trim();
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        !element.closest("table, thead, tbody, tfoot, tr, th, td") &&
        Boolean(text) &&
        !isExcludedOptionText(text) &&
        (!box || isNearAnchor(rect)) &&
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    }).sort((left, right) => {
      const leftAnchored = isNearAnchor(left.getBoundingClientRect()) ? 1 : 0;
      const rightAnchored = isNearAnchor(right.getBoundingClientRect()) ? 1 : 0;
      return rightAnchored - leftAnchored;
    });

    const target = options[0];
    target?.click();
    return target?.textContent?.replace(/\s+/g, " ").trim() ?? null;
  }, { box: anchorBox ?? null, optionSelector: DROPDOWN_OPTION_SELECTOR });
}

async function scrollVisibleDropdownOptions(
  page: Page,
  anchorBox?: ElementBox | null,
) {
  return await page.evaluate(({ box, optionSelector }) => {
    const visibleOptions = Array.from(
      document.querySelectorAll<HTMLElement>(optionSelector),
    ).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        !element.closest("table, thead, tbody, tfoot, tr, th, td") &&
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    });

    const scrollables = visibleOptions
      .flatMap((option) => {
        const ancestors: HTMLElement[] = [];
        let current = option.parentElement;
        while (current) {
          ancestors.push(current);
          current = current.parentElement;
        }
        return ancestors;
      })
      .filter((element, index, list) => list.indexOf(element) === index)
      .filter((element) => element.scrollHeight > element.clientHeight + 4)
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return leftRect.height - rightRect.height;
      });

    for (const element of scrollables) {
      const previousTop = element.scrollTop;
      element.scrollTop = Math.min(
        element.scrollTop + Math.max(element.clientHeight * 0.8, 160),
        element.scrollHeight - element.clientHeight,
      );
      if (element.scrollTop !== previousTop) {
        return true;
      }
    }

    return false;
  }, { box: anchorBox ?? null, optionSelector: DROPDOWN_OPTION_SELECTOR });
}

async function waitForDropdownValue(
  page: Page,
  label: string,
  expectedValue: string,
) {
  const dropdown = dropdownFor(page, label);

  await expect
    .poll(
      async () => {
        const text = await dropdown.innerText();
        return text.replace(/\s+/g, " ").trim();
      },
      { timeout: 15000 },
    )
    .toContain(expectedValue);
}

function normalizeFieldLabel(value: string) {
  return value.replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

function extractLeadFormFields(payload: LeadFormApiPayload): LeadFieldTarget[] {
  const sections = payload.data?.items?.sections ?? [];

  return sections
    .filter((section) => section.isActive !== false)
    .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0))
    .flatMap((section) =>
      (section.fields ?? [])
        .filter((field) => field.isActive !== false && field.isVisible !== false)
        .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0))
        .map((field) => ({
          ...field,
          normalizedLabel: normalizeFieldLabel(field.label),
        })),
    )
    .filter(
      (field) => field.isMandatory || REQUIRED_LEAD_IDENTITY_KEYS.has(field.key),
    );
}

async function waitForLeadFormApiFields(page: Page) {
  const response = await page.waitForResponse(
    (candidate) => {
      const request = candidate.request();
      const url = new URL(candidate.url());
      return (
        request.method() === "GET" &&
        url.pathname.endsWith("/lead-form") &&
        candidate.ok()
      );
    },
    { timeout: 30000 },
  );

  const payload = (await response.json()) as LeadFormApiPayload;
  return extractLeadFormFields(payload);
}

async function collectMandatoryFieldsFromDom(page: Page): Promise<LeadFieldTarget[]> {
  const modal = page.locator("#root-modal");
  const fields = await modal.locator("h3").evaluateAll((headings) =>
    headings
      .filter((heading) => {
        const text = (heading.textContent ?? "").replace(/\s+/g, " ").trim();
        const rect = heading.getBoundingClientRect();
        const style = window.getComputedStyle(heading);
        return (
          text.includes("*") &&
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      })
      .map((heading) => {
        const label = (heading.textContent ?? "")
          .replace(/\*/g, "")
          .replace(/\s+/g, " ")
          .trim();

        return {
          key: label
            .replace(/[^A-Za-z0-9]+(.)/g, (_, next: string) =>
              next.toUpperCase(),
            )
            .replace(/^[A-Z]/, (match) => match.toLowerCase()),
          label,
        };
      }),
  );

  return fields.map((field) => ({
    ...field,
    normalizedLabel: normalizeFieldLabel(field.label),
    isMandatory: true,
    isVisible: true,
    isActive: true,
  }));
}

function dedupeLeadFields(fields: LeadFieldTarget[]) {
  const seen = new Set<string>();
  const seenLabels = new Set<string>();

  return fields.filter((field) => {
    const id = `${field.key}:${field.normalizedLabel.toLowerCase()}`;
    const label = field.normalizedLabel.toLowerCase();
    if (seen.has(id) || seenLabels.has(label)) {
      return false;
    }

    seen.add(id);
    seenLabels.add(label);
    return true;
  });
}

async function openLeadCreationForm(page: Page) {
  await logStep("Open create lead form");
  const addLeadButton = page.getByText("Add Lead", { exact: true });
  await clickWithFallback(page, addLeadButton, async () => {
    const leadFormVisible = await page
      .getByText("Lead Form", { exact: true })
      .isVisible()
      .catch(() => false);
    const nestedAddLeadVisible = await page
      .getByText("Add Lead", { exact: true })
      .last()
      .isVisible()
      .catch(() => false);
    return leadFormVisible || nestedAddLeadVisible;
  });

  const leadForm = page.getByText("Lead Form", { exact: true });
  if (!(await leadForm.isVisible().catch(() => false))) {
    await page.waitForTimeout(800);
    await clickNestedAddLeadAction(page);
  }

  await expect(leadForm).toBeVisible({ timeout: 30000 });
  await waitForLeadFormReady(page);
}

async function waitForLeadFormReady(page: Page) {
  const nameInput = page.locator("#root-modal #fullName").first();
  const projectDropdown = dropdownFor(page, "Project Name *");
  const sourceDropdown = dropdownFor(page, "Source *");

  await expect
    .poll(
      async () => {
        const formText = await page.locator("#root-modal").innerText().catch(() => "");
        const nameReady = await nameInput.isVisible().catch(() => false) &&
          !(await nameInput.isDisabled().catch(() => true));
        const projectReady = await projectDropdown.isVisible().catch(() => false) &&
          !(await projectDropdown.isDisabled().catch(() => true));
        const sourceReady = await sourceDropdown.isVisible().catch(() => false) &&
          !(await sourceDropdown.isDisabled().catch(() => true));

        return nameReady && projectReady && sourceReady && !/loading\.\.\./i.test(formText);
      },
      { timeout: 60000 },
    )
    .toBeTruthy();
}

async function visibleFieldContainer(page: Page, field: LeadFieldTarget) {
  const modal = page.locator("#root-modal");
  const labelRegex = new RegExp(
    `^\\s*${escapeRegex(field.normalizedLabel)}\\s*\\*?\\s*$`,
    "i",
  );
  const headings = modal.locator("h3").filter({ hasText: labelRegex });
  const count = await headings.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    const heading = headings.nth(index);
    if (!(await heading.isVisible().catch(() => false))) {
      continue;
    }

    const container = heading.locator(
      'xpath=ancestor::div[.//h3 and (.//input or .//textarea or .//button[not(normalize-space(.)="Clear")])][1]',
    );
    if (await container.isVisible().catch(() => false)) {
      return container;
    }
  }

  throw new Error(`Lead form field "${field.normalizedLabel}" was not visible.`);
}

async function firstVisible(locator: Locator) {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }

  return null;
}

function formattedDate(date: Date) {
  return {
    iso: date.toISOString().slice(0, 10),
    display: date.toLocaleDateString("en-GB"),
    month: date.toLocaleString("en-US", { month: "long" }),
    day: String(date.getDate()),
    year: String(date.getFullYear()),
  };
}

function dateForLeadField(field: LeadFieldTarget) {
  const fieldName = `${field.key} ${field.normalizedLabel}`.toLowerCase();
  const date = new Date();

  if (/birth|dob/.test(fieldName)) {
    date.setFullYear(date.getFullYear() - 35);
    return date;
  }

  if (/anniversary/.test(fieldName)) {
    date.setFullYear(date.getFullYear() - 5);
    return date;
  }

  if (/deadline|follow|next|future|schedule|booking|visit/.test(fieldName)) {
    date.setDate(date.getDate() + 7);
    return date;
  }

  return date;
}

function valueForLeadField(
  field: LeadFieldTarget,
  leadSeed: LeadSeed,
  app: AppConfig,
) {
  const fieldName = `${field.key} ${field.normalizedLabel}`.toLowerCase();

  if (field.key === "fullName" || /full name/.test(fieldName)) {
    return leadSeed.fullName;
  }

  if (field.key === "whatsAppNumber" || /whats\s*app/.test(fieldName)) {
    return leadSeed.whatsappNumber;
  }

  if (field.key === "projectName" || /project/.test(fieldName)) {
    return app.activeProjectName;
  }

  if (field.key === "sourceCategory") {
    return leadSeed.sourceCategory;
  }

  if (/company|organisation|organization/.test(fieldName)) {
    return leadSeed.companyName;
  }

  if (/preferred location|location|city/.test(fieldName)) {
    return leadSeed.preferredLocation;
  }

  if (/other preference|preference|description|remark|comment|address/.test(fieldName)) {
    return leadSeed.otherPreferences;
  }

  if (/email/.test(fieldName)) {
    return leadSeed.email;
  }

  if (/phone|mobile|alternate number|contact/.test(fieldName)) {
    return `8${randomDigits(9)}`;
  }

  if (/age/.test(fieldName)) {
    return "35";
  }

  if (/budget/.test(fieldName)) {
    return "5000000";
  }

  if (/time/.test(fieldName)) {
    return "10:30";
  }

  if (field.type === "number") {
    return "1";
  }

  return `Automation ${field.normalizedLabel}`.slice(0, 40);
}

function isOptionalAlternateEmailField(field: Pick<LeadFieldTarget, "key" | "normalizedLabel" | "label">) {
  const fieldName = `${field.key} ${field.normalizedLabel || field.label}`.toLowerCase();
  return /alternate/.test(fieldName) && /email/.test(fieldName);
}

function preferredOptionsForField(
  field: LeadFieldTarget,
  leadSeed: LeadSeed,
  app: AppConfig,
  sourcePreferences: string[],
) {
  const fieldName = `${field.key} ${field.normalizedLabel}`.toLowerCase();

  if (field.key === "projectName" || /project/.test(fieldName)) {
    return [app.activeProjectName, leadSeed.projectName];
  }

  if (field.key === "sourceOfLead" || /^source\b/.test(fieldName)) {
    return sourcePreferences;
  }

  if (/gender/.test(fieldName)) {
    return ["Male", "Female"];
  }

  if (/purpose/.test(fieldName)) {
    return ["Personal Use", "Investment"];
  }

  if (/funding|loan/.test(fieldName)) {
    return ["Self funded", "Loan"];
  }

  return (field.options ?? [])
    .map((option) => option.label ?? option.value ?? "")
    .filter(Boolean);
}

async function clickInlineOption(
  container: Locator,
  preferredOptions: string[],
) {
  const buttonLocator = container.locator("button");
  const count = await buttonLocator.count().catch(() => 0);
  const candidates: { button: Locator; text: string }[] = [];

  for (let index = 0; index < count; index += 1) {
    const button = buttonLocator.nth(index);
    const text = (await button.innerText().catch(() => ""))
      .replace(/\s+/g, " ")
      .trim();
    if (
      !text ||
      /^select here$/i.test(text) ||
      /^clear$/i.test(text) ||
      !(await button.isVisible().catch(() => false))
    ) {
      continue;
    }

    candidates.push({ button, text });
  }

  const preferred = preferredOptions.find((option) =>
    candidates.some((candidate) => candidate.text === option),
  );
  const selected =
    candidates.find((candidate) => candidate.text === preferred) ??
    candidates[0];

  if (!selected) {
    return false;
  }

  await selected.button.click({ force: true });
  return true;
}

async function selectDropdownField(
  page: Page,
  field: LeadFieldTarget,
  preferredOptions: string[] = [],
) {
  const container = await visibleFieldContainer(page, field);
  await container.scrollIntoViewIfNeeded().catch(() => {});

  if (field.options?.length) {
    const clickedInline = await clickInlineOption(container, preferredOptions);
    if (clickedInline) {
      return;
    }
  }

  const trigger = await firstVisible(container.locator("button"));
  if (!trigger) {
    throw new Error(`Lead form field "${field.normalizedLabel}" has no dropdown trigger.`);
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    await trigger.click({ force: true });
    const opened = await expect
      .poll(() => dropdownHasVisibleOptions(page, trigger), {
        intervals: [150, 250, 400],
        timeout: 1200,
      })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (opened) {
      break;
    }

    await page.waitForTimeout(500);
  }

  await chooseFirstOption(page, preferredOptions, trigger);
}

async function fillTextField(
  field: LeadFieldTarget,
  container: Locator,
  value: string,
) {
  const input = await firstVisible(
    container.locator("textarea, input:not([type='hidden'])"),
  );
  if (!input) {
    throw new Error(`Lead form field "${field.normalizedLabel}" has no editable input.`);
  }

  await input.scrollIntoViewIfNeeded().catch(() => {});
  const maxLength = Number(await input.getAttribute("maxlength").catch(() => ""));
  const finalValue = maxLength > 0 ? value.slice(0, maxLength) : value;
  await input.fill(finalValue);
}

async function selectReactDate(page: Page, field: LeadFieldTarget, target: Date) {
  const container = await visibleFieldContainer(page, field);
  const directDateInput = await firstVisible(container.locator("input[type='date']"));
  const date = formattedDate(target);

  if (directDateInput) {
    await directDateInput.fill(date.iso);
    return;
  }

  const trigger = await firstVisible(container.locator("button"));
  if (!trigger) {
    const directTextInput = await firstVisible(
      container.locator("input:not([type='hidden'])"),
    );
    if (directTextInput) {
      await directTextInput.fill(date.display);
      return;
    }

    throw new Error(`Lead form field "${field.normalizedLabel}" has no date trigger.`);
  }

  await trigger.click({ force: true });
  const picker = page.locator(".react-datepicker").last();
  await expect(picker).toBeVisible({ timeout: 10000 });

  await selectCalendarYear(page, picker, target.getFullYear());
  await selectCalendarMonth(page, picker, target);

  const dayOption = picker
    .locator(`[role="option"][aria-label*="${date.month}"][aria-label*="${date.year}"]`)
    .filter({ hasText: new RegExp(`^${date.day}$`) })
    .first();
  if (
    await dayOption
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await dayOption.click({ force: true });
    return;
  }

  const visibleDay = picker
    .locator("[role='option']")
    .filter({ hasText: new RegExp(`^${date.day}$`) })
    .first();
  await expect(visibleDay).toBeVisible({ timeout: 5000 });
  await visibleDay.click({ force: true });
}

async function selectCalendarYear(page: Page, picker: Locator, targetYear: number) {
  const yearSelect = picker.locator("select.react-datepicker__year-select");
  if (await yearSelect.isVisible().catch(() => false)) {
    await yearSelect.selectOption(String(targetYear));
    return;
  }

  const yearText = String(targetYear);
  const currentYear = new Date().getFullYear();

  if (currentYear === targetYear) {
    return;
  }

  const yearToggle = picker
    .locator("button, div, span")
    .filter({ hasText: new RegExp(`^${currentYear}$`) })
    .first();
  if (await yearToggle.isVisible().catch(() => false)) {
    await yearToggle.click({ force: true });
  }

  const scrollDirection = currentYear && targetYear < currentYear ? -1 : 1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await clickCalendarText(page, yearText)) {
      return;
    }

    if (!(await scrollCalendarOptionList(page, scrollDirection))) {
      break;
    }
    await page.waitForTimeout(100);
  }
}

async function selectCalendarMonth(page: Page, picker: Locator, target: Date) {
  const monthSelect = picker.locator("select.react-datepicker__month-select");
  if (await monthSelect.isVisible().catch(() => false)) {
    await monthSelect.selectOption(String(target.getMonth()));
    return;
  }

  const month = target.toLocaleString("en-US", { month: "long" });
  const currentMonthText = await picker
    .locator("button, div, span")
    .filter({
      hasText: /January|February|March|April|May|June|July|August|September|October|November|December/,
    })
    .first()
    .innerText()
    .catch(() => "");

  if (currentMonthText.includes(month)) {
    return;
  }

  const monthToggle = picker
    .locator("button, div, span")
    .filter({
      hasText: /January|February|March|April|May|June|July|August|September|October|November|December/,
    })
    .first();
  if (await monthToggle.isVisible().catch(() => false)) {
    await monthToggle.click({ force: true });
    await clickCalendarText(page, month);
  }
}

async function clickCalendarText(page: Page, text: string) {
  return await page.evaluate((targetText) => {
    const picker = document.querySelector<HTMLElement>(".react-datepicker");
    if (!picker) {
      return false;
    }

    const candidates = Array.from(
      picker.querySelectorAll<HTMLElement>("button, div, span, [role='option']"),
    ).filter((element) => {
      const elementText = element.textContent?.replace(/\s+/g, " ").trim();
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        elementText === targetText &&
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    });

    const target = candidates[0];
    if (!target) {
      return false;
    }

    target.click();
    return true;
  }, text);
}

async function scrollCalendarOptionList(page: Page, direction: number) {
  return await page.evaluate((scrollDirection) => {
    const picker = document.querySelector<HTMLElement>(".react-datepicker");
    if (!picker) {
      return false;
    }

    const scrollables = Array.from(
      picker.querySelectorAll<HTMLElement>("div, ul"),
    )
      .filter((element) => element.scrollHeight > element.clientHeight + 4)
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return leftRect.height - rightRect.height;
      });

    for (const element of scrollables) {
      const previousTop = element.scrollTop;
      const distance = Math.max(element.clientHeight * 0.8, 120) * scrollDirection;
      element.scrollTop = Math.max(
        0,
        Math.min(element.scrollTop + distance, element.scrollHeight - element.clientHeight),
      );
      if (element.scrollTop !== previousTop) {
        return true;
      }
    }

    return false;
  }, direction);
}

async function fillLeadField(
  page: Page,
  field: LeadFieldTarget,
  leadSeed: LeadSeed,
  app: AppConfig,
  sourcePreferences: string[],
) {
  const fieldName = `${field.key} ${field.normalizedLabel}`.toLowerCase();
  const type = (field.type ?? "").toLowerCase();

  if (type.includes("date") || field.config?.datePicker) {
    await selectReactDate(page, field, dateForLeadField(field));
    return;
  }

  if (type.includes("time")) {
    const container = await visibleFieldContainer(page, field);
    await fillTextField(field, container, valueForLeadField(field, leadSeed, app));
    return;
  }

  const container = await visibleFieldContainer(page, field);
  const hasInput = Boolean(
    await firstVisible(container.locator("textarea, input:not([type='hidden'])")),
  );
  const hasTrigger = Boolean(await firstVisible(container.locator("button")));
  const shouldUseDropdown =
    field.options?.length ||
    field.key === "projectName" ||
    field.key === "sourceOfLead" ||
    field.key === "subSourceOfLead" ||
    /assigned|owner|source|project|gender|occupation|qualification|purpose|status|type|funding|loan/.test(
      fieldName,
    );

  if (shouldUseDropdown && hasTrigger) {
    await selectDropdownField(
      page,
      field,
      preferredOptionsForField(field, leadSeed, app, sourcePreferences),
    );
    return;
  }

  if (hasInput) {
    await fillTextField(field, container, valueForLeadField(field, leadSeed, app));
    return;
  }

  if (hasTrigger) {
    await selectDropdownField(
      page,
      field,
      preferredOptionsForField(field, leadSeed, app, sourcePreferences),
    );
    return;
  }

  throw new Error(
    `Lead form field "${field.normalizedLabel}" has no supported visible control.`,
  );
}

async function fillAdaptiveLeadFields(
  page: Page,
  fields: LeadFieldTarget[],
  leadSeed: LeadSeed,
  app: AppConfig,
  sourcePreferences: string[],
) {
  const orderedFields = fields.filter((field) =>
    !CORE_LEAD_FIELD_KEYS.has(field.key) &&
    !isOptionalAlternateEmailField(field)
  );
  if (orderedFields.length) {
    await logStep(`Fill ${orderedFields.length} mandatory custom field${orderedFields.length === 1 ? "" : "s"}`);
  }

  for (const field of orderedFields) {
    await fillLeadField(page, field, leadSeed, app, sourcePreferences);
  }
}

async function fillCoreLeadFields(
  page: Page,
  leadSeed: LeadSeed,
  app: AppConfig,
  sourcePreferences: string[],
) {
  await base.step("Enter lead name", async () => {
    await page.locator("#fullName").fill(leadSeed.fullName);
  });

  await base.step("Select project", async () => {
    const expectedProject = [app.activeProjectName, leadSeed.projectName].find(Boolean);
    for (let formAttempt = 0; formAttempt < 2; formAttempt += 1) {
      const projectDropdownButton = dropdownFor(page, "Project Name *");
      const alreadySelectedProject = await projectDropdownButton
        .innerText()
        .then((text) => text.replace(/\s+/g, " ").trim())
        .catch(() => "");
      if (expectedProject && alreadySelectedProject.includes(expectedProject)) {
        app.activeProjectName = expectedProject;
        leadSeed.projectName = expectedProject;
        return;
      }

      try {
        const projectDropdown = await openDropdownWithRetry(page, "Project Name *");
        const selectedProject = await chooseFirstOption(
          page,
          [app.activeProjectName, leadSeed.projectName],
          projectDropdown,
          false,
        );
        app.activeProjectName = selectedProject;
        leadSeed.projectName = selectedProject;
        await waitForDropdownValue(page, "Project Name *", selectedProject);
        return;
      } catch (error) {
        if (formAttempt === 1) {
          throw error;
        }

        await page.keyboard.press("Escape").catch(() => {});
        await page.getByRole("button", { name: /^cancel$/i }).last().click({ force: true }).catch(() => {});
        await expect(page.locator("#root-modal")).toBeHidden({ timeout: 10000 }).catch(() => {});
        await openLeadCreationForm(page);
        await page.locator("#fullName").fill(leadSeed.fullName);
      }
    }
  });

  await base.step("Select source", async () => {
    const sourceDropdown = await openDropdownWithRetry(page, "Source *");
    const selectedSource = await chooseFirstOption(page, sourcePreferences, sourceDropdown);
    leadSeed.sourceOfLead = selectedSource;
    await waitForDropdownValue(page, "Source *", selectedSource);
  });

  await base.step("Select sub source", async () => {
    const subSourceDropdown = await openDropdownWithRetry(page, "Sub Source *");
    const selectedSubSource = await chooseFirstOption(page, [], subSourceDropdown);
    leadSeed.subSourceOfLead = selectedSubSource;
    await waitForDropdownValue(page, "Sub Source *", selectedSubSource);
  });

  await base.step("Enter WhatsApp number", async () => {
    await page.locator("#whatsAppNumber").fill(leadSeed.whatsappNumber);
  });

  await base.step("Enter email if available", async () => {
    await fillFirstVisibleField(
      page,
      [
        page.locator("#email").first(),
        page.locator('input[name="email"]').first(),
        page.locator('input[type="email"]').first(),
        page.getByLabel(/email/i).first(),
        page.getByText(/^Email ID\s*\*?$/i).locator("xpath=following::input[1]").first(),
      ],
      leadSeed.email,
    );
  });
}

export async function prepareLeadForm(page: Page, app: AppConfig) {
  const leadSeed = buildLeadSeed(app.envName);
  leadSeed.projectName = app.activeProjectName;
  const envSeed = getLeadFlowSeed(app.envName);
  const sourcePreferences = envSeed.fallbackSourcePreferences;
  return await prepareLeadFormWithSeed(page, app, leadSeed, sourcePreferences);
}

async function prepareLeadFormWithSeed(
  page: Page,
  app: AppConfig,
  leadSeed: LeadSeed,
  sourcePreferences: string[],
) {
  await waitForListingReady(page);

  const apiFieldsPromise = waitForLeadFormApiFields(page).catch(() => []);
  await openLeadCreationForm(page);

  const [apiFields, domMandatoryFields] = await Promise.all([
    apiFieldsPromise,
    collectMandatoryFieldsFromDom(page),
  ]);
  const fields = dedupeLeadFields([...apiFields, ...domMandatoryFields]);
  await fillCoreLeadFields(page, leadSeed, app, sourcePreferences);
  await fillAdaptiveLeadFields(
    page,
    fields,
    leadSeed,
    app,
    sourcePreferences,
  );

  return leadSeed;
}

export async function fillLeadForm(page: Page, app: AppConfig) {
  const leadSeed = await prepareLeadForm(page, app);

  await base.step("Save lead", async () => {
    await saveLeadFormAndWaitForClose(page);
  });

  return leadSeed;
}

export async function fillLeadFormWithSeed(
  page: Page,
  app: AppConfig,
  leadSeed: LeadSeed,
  sourcePreferences?: string[],
) {
  leadSeed.projectName = app.activeProjectName;
  const envSeed = getLeadFlowSeed(app.envName);
  const preparedLeadSeed = await prepareLeadFormWithSeed(
    page,
    app,
    leadSeed,
    sourcePreferences ?? envSeed.fallbackSourcePreferences,
  );

  await base.step("Save lead", async () => {
    await saveLeadFormAndWaitForClose(page);
  });

  return preparedLeadSeed;
}

async function expectLeadFormMessages(page: Page, messages: RegExp[]) {
  const formArea = page.locator("#root-modal, #scrollableArea").first();
  for (const message of messages) {
    await expect(formArea).toContainText(message, { timeout: 15000 });
  }
}

async function expectOptionalLeadFormMessage(page: Page, message: RegExp) {
  const formArea = page.locator("#root-modal, #scrollableArea").first();
  const text = await formArea.innerText().catch(() => "");
  if (message.test(text)) {
    await expect(formArea).toContainText(message, { timeout: 15000 });
  }
}

export async function fillLeadFormAfterValidationChecks(page: Page, app: AppConfig) {
  const leadSeed = buildLeadSeed(app.envName);
  leadSeed.projectName = app.activeProjectName;
  const envSeed = getLeadFlowSeed(app.envName);
  const sourcePreferences = preferStandardLeadSources(envSeed.fallbackSourcePreferences);
  await waitForListingReady(page);

  const apiFieldsPromise = waitForLeadFormApiFields(page).catch(() => []);
  await openLeadCreationForm(page);

  const leadFormPage = new LeadFormPage(page);
  await base.step("Verify mandatory add lead validations", async () => {
    await leadFormPage.saveButton.click();
    await expectLeadFormMessages(page, [
      /Please select Source of Lead/i,
      /Please select Sub source of lead/i,
      /Please enter Primary Number/i,
    ]);
    await expectOptionalLeadFormMessage(page, /Please enter Source category/i);
  });

  const [apiFields, domMandatoryFields] = await Promise.all([
    apiFieldsPromise,
    collectMandatoryFieldsFromDom(page),
  ]);
  const fields = dedupeLeadFields([...apiFields, ...domMandatoryFields]);
  await fillCoreLeadFields(page, leadSeed, app, sourcePreferences);

  await base.step("Verify WhatsApp number validation", async () => {
    await leadFormPage.whatsappInput.fill("78787878");
    await expectLeadFormMessages(page, [/Please enter a valid WhatsApp Number/i]);
    await leadFormPage.whatsappInput.fill(leadSeed.whatsappNumber);
  });

  await base.step("Verify email format validation", async () => {
    const emailFieldCandidates = [
      page.locator("#email").first(),
      page.locator('input[name="email"]').first(),
      page.locator('input[type="email"]').first(),
      page.getByLabel(/email/i).first(),
      page.getByText(/^Email ID\s*\*?$/i).locator("xpath=following::input[1]").first(),
    ];

    const invalidEmailFilled = await fillFirstVisibleField(page, emailFieldCandidates, "ttt.in");
    if (invalidEmailFilled) {
      await expectLeadFormMessages(page, [/Invalid Email id format/i]);
      await fillFirstVisibleField(page, emailFieldCandidates, leadSeed.email);
    }
  });

  await fillAdaptiveLeadFields(
    page,
    fields,
    leadSeed,
    app,
    sourcePreferences,
  );

  await base.step("Save lead", async () => {
    await saveLeadFormAndWaitForClose(page);
  });

  return leadSeed;
}

async function leadFormIsOpen(page: Page) {
  return await page
    .getByText("Lead Form", { exact: true })
    .isVisible()
    .catch(() => false);
}

async function clearDropdownField(page: Page, label: string) {
  const normalizedLabel = normalizeFieldLabel(label);
  const labelRegex = new RegExp(
    `^\\s*${escapeRegex(normalizedLabel)}\\s*\\*?\\s*$`,
    "i",
  );
  const fieldContainer = page
    .locator("#root-modal h3")
    .filter({ hasText: labelRegex })
    .first()
    .locator(
      'xpath=ancestor::div[.//h3 and (.//input or .//textarea or .//button[not(normalize-space(.)="Clear")])][1]',
    );

  const clearAction = fieldContainer.getByText(/^Clear$/i).first();
  if (await clearAction.isVisible().catch(() => false)) {
    await clearAction.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function repairLeadFormValidationErrors(page: Page) {
  const formText = await page.locator("#root-modal, #scrollableArea").first().innerText().catch(() => "");

  if (/Please select Project Name/i.test(formText)) {
    await base.step("Re-select project name", async () => {
      await repairRequiredDropdownField(page, "Project Name *");
    });
  }

  if (/Please select Assigned to/i.test(formText)) {
    await base.step("Re-select assigned user", async () => {
      await repairRequiredDropdownField(page, "Assigned To *");
    });
  }

  if (/Please select Secondary owner/i.test(formText)) {
    await base.step("Re-select secondary owner", async () => {
      await repairRequiredDropdownField(page, "Secondary Owner *");
    });
  }

  if (/Invalid Email id format/i.test(formText)) {
    await base.step("Clear optional lead email fields", async () => {
      await fillVisibleLeadEmailInputs(page);
      await clearOptionalLeadEmailInputs(page);
    });
  }
}

async function repairRequiredDropdownField(page: Page, label: string) {
  const dropdown = dropdownFor(page, label);
  const previousValue = await dropdown
    .innerText()
    .then((text) => text.replace(/\s+/g, " ").replace(/^Clear\s*/i, "").trim())
    .catch(() => "");

  const openedDropdown = await openDropdownWithRetry(page, label);
  const optionTexts = await visibleDropdownOptionTexts(page, await locatorBox(openedDropdown));
  const preferredOption = optionTexts.find((option) =>
    option &&
    !/^select here$/i.test(option) &&
    option.toLowerCase() !== previousValue.toLowerCase()
  ) || optionTexts[0];

  const selectedValue = preferredOption
    ? await chooseFirstOption(page, [preferredOption], openedDropdown)
    : await chooseFirstOption(page, [], openedDropdown);
  await page.mouse.click(20, 20).catch(() => {});
  await waitForDropdownValue(page, label, selectedValue);
}

async function fillVisibleLeadEmailInputs(page: Page) {
  await page.locator("#root-modal").evaluate((modal) => {
    const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const fieldContext = (element: HTMLElement) => {
      let current: HTMLElement | null = element;
      for (let depth = 0; current && depth < 6 && current !== modal; depth += 1) {
        const text = normalize(current.innerText || current.textContent);
        if (/email/i.test(text) && text.length < 500) {
          return text;
        }
        current = current.parentElement;
      }
      return "";
    };
    const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const prototype = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      descriptor?.set?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.blur();
    };

    Array.from(modal.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type='hidden']), textarea"))
      .filter((input) => !input.disabled && !input.readOnly && visible(input))
      .filter((input) => {
        const metadata = normalize([
          input.id,
          input.name,
          input.placeholder,
          input.getAttribute("aria-label"),
          fieldContext(input),
        ].join(" "));
        return /email/i.test(metadata) && !/alternate/i.test(metadata);
      })
      .forEach((input, index) => setNativeValue(input, `automation.lead.${index + 1}@example.com`));
  }).catch(() => {});
  await page.waitForTimeout(500);
}

async function clearOptionalLeadEmailInputs(page: Page) {
  await page.locator("#root-modal").evaluate((modal) => {
    const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const fieldContext = (element: HTMLElement) => {
      let current: HTMLElement | null = element;
      for (let depth = 0; current && depth < 6 && current !== modal; depth += 1) {
        const text = normalize(current.innerText || current.textContent);
        if (/email/i.test(text) && text.length < 500) {
          return text;
        }
        current = current.parentElement;
      }
      return "";
    };
    const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const prototype = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      descriptor?.set?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.blur();
    };

    Array.from(modal.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type='hidden']), textarea"))
      .filter((input) => !input.disabled && !input.readOnly && visible(input))
      .forEach((input) => {
        const context = normalize([
          input.id,
          input.name,
          input.placeholder,
          input.getAttribute("aria-label"),
          fieldContext(input),
        ].join(" "));
        const isEmailField = /email/i.test(context);
        const isPrimaryEmail = /(^|\s)email\s*id(\s|$)/i.test(context) && !/alternate|email\s*id\s*[2-9]/i.test(context);
        if (isEmailField && !isPrimaryEmail) {
          setNativeValue(input, "");
        }
      });
  }).catch(() => {});
  await page.waitForTimeout(500);
}

async function fillVisibleUnselectedLeadDropdowns(page: Page) {
  const modal = page.locator("#root-modal");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const dropdown = modal
      .locator("button")
      .filter({ hasText: /^Select here$/i })
      .first();
    if (!await dropdown.isVisible().catch(() => false)) {
      return;
    }

    await dropdown.scrollIntoViewIfNeeded().catch(() => {});
    const dropdownBox = await locatorBox(dropdown);
    await dropdown.click({ force: true, timeout: 3000 }).catch(() => {});
    await waitForDropdownOptions(page, dropdown).catch(() => {});
    const selectedOption =
      await clickFirstVisibleDropdownOption(page, dropdownBox) ||
      await clickFirstVisibleDropdownOption(page, null);
    if (!selectedOption) {
      return;
    }
    await page.waitForTimeout(400);
  }
}

async function fillVisibleEmptyLeadInputs(page: Page) {
  const modal = page.locator("#root-modal");
  const inputs = modal.locator("input:not([type='hidden']), textarea");
  const count = await inputs.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    const input = inputs.nth(index);
    if (!await input.isVisible().catch(() => false)) {
      continue;
    }

    const value = await input.inputValue().catch(() => "");
    const placeholder = await input.getAttribute("placeholder").catch(() => "") ?? "";
    const disabled = await input.isDisabled().catch(() => true);
    const readonly = await input.getAttribute("readonly").catch(() => null);
    if (disabled || readonly !== null || value.trim()) {
      continue;
    }

    const emailContext = await input.evaluate((element) => {
      const normalize = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
      let current: HTMLElement | null = element as HTMLElement;
      for (let depth = 0; current && depth < 6; depth += 1) {
        const text = normalize(current.innerText || current.textContent);
        if (/email/i.test(text) && text.length < 500) {
          return text;
        }
        current = current.parentElement;
      }
      return "";
    }).catch(() => "");
    const isOptionalEmail = /email/i.test(emailContext) &&
      (!/(^|\s)email\s*id(\s|$)/i.test(emailContext) || /alternate|email\s*id\s*[2-9]/i.test(emailContext));
    if (isOptionalEmail) {
      continue;
    }

    const fillValue = /email/i.test(`${placeholder} ${emailContext}`)
      ? "automation.lead@example.com"
      : /budget|amount|price|cost|number|phone|mobile|alternate/i.test(placeholder)
        ? "100000"
        : "Automation";
    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.fill(fillValue).catch(() => {});
  }
}

async function saveLeadFormAndWaitForClose(page: Page) {
  const leadFormPage = new LeadFormPage(page);
  await clickLeadFormSaveButton(page);

  const closed = await leadFormPage.title
    .waitFor({ state: "hidden", timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  if (closed) {
    return;
  }

  await repairLeadFormValidationErrors(page);
  if (!(await leadFormIsOpen(page))) {
    return;
  }

  await clickLeadFormSaveButton(page);
  const saved = await expect
    .poll(async () => !(await leadFormIsOpen(page)), { timeout: 60000 })
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
  if (!saved) {
    const formText = await page.locator("#root-modal, #scrollableArea").first().innerText().catch(() => "");
    throw new Error(`Lead form did not close after Save. Visible form text: ${formText.replace(/\s+/g, " ").trim().slice(0, 1500)}`);
  }
}

async function clickLeadFormSaveButton(page: Page) {
  const saveButtons = [
    page.locator("#root-modal").getByRole("button", { name: /^save$/i }),
    page.getByRole("button", { name: /^save$/i }).last(),
    page.locator("button").filter({ hasText: /^Save$/i }).last(),
  ];

  for (const saveButton of saveButtons) {
    if (await saveButton.isVisible().catch(() => false)) {
      await saveButton.click({ force: true });
      return;
    }
  }

  throw new Error("Save button was not visible in the lead form.");
}

export async function validateCreateLeadAndChangeStage(
  page: Page,
  app: AppConfig,
) {
  const leadSeed = await fillLeadFormAfterValidationChecks(page, app);
  await assertLeadCreated(page, leadSeed.fullName, leadSeed.projectName);
  await openLeadByName(page, leadSeed.fullName);
  await changeOpenedLeadToAnyAvailableStage(page, "test remark");
  return leadSeed;
}

async function hasDuplicateLeadBusinessRule(page: Page) {
  if (await page.getByText(DUPLICATE_LEAD_PATTERN).first().isVisible({ timeout: 1000 }).catch(() => false)) {
    return true;
  }

  return await page
    .evaluate((source) => {
      const duplicatePattern = new RegExp(source, "i");
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const isVisible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      };

      const visibleDuplicateText = Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .some((element) => isVisible(element) && duplicatePattern.test(normalize(element.innerText || element.textContent)));
      if (visibleDuplicateText) {
        return true;
      }

      const phoneInput = document.querySelector<HTMLInputElement>("#whatsAppNumber");
      if (!phoneInput) {
        return false;
      }

      let container: HTMLElement | null = phoneInput;
      for (let depth = 0; depth < 6 && container; depth += 1) {
        const text = normalize(container.innerText || container.textContent);
        const className = typeof container.className === "string" ? container.className : "";
        const style = window.getComputedStyle(container);
        const hasErrorClass = /border-red|text-red|error|invalid/i.test(className);
        const hasErrorBorder =
          /rgb\(\s*255\s*,\s*(0|[1-9]\d?)\s*,\s*(0|[1-9]\d?)\s*\)/i.test(style.borderColor) ||
          /rgb\(\s*255\s*,\s*(0|[1-9]\d?)\s*,\s*(0|[1-9]\d?)\s*\)/i.test(style.outlineColor);
        const isPhoneFieldContainer = /\+91|WhatsApp|Primary Number/i.test(text) && phoneInput.value.trim().length === 10;
        if (duplicatePattern.test(text) || hasErrorClass || hasErrorBorder || isPhoneFieldContainer && Boolean(container.querySelector("img, svg"))) {
          return true;
        }

        container = container.parentElement;
      }

      return false;
    }, DUPLICATE_LEAD_PATTERN.source)
    .catch(() => false);
}

async function waitForDuplicateLeadBusinessRule(page: Page, timeout = 7000) {
  return await expect
    .poll(async () => await hasDuplicateLeadBusinessRule(page), { timeout })
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
}

async function expectDuplicateLeadBusinessRule(page: Page) {
  await expect
    .poll(async () => await hasDuplicateLeadBusinessRule(page), { timeout: 30000 })
    .toBeTruthy();
}

export async function createLeadAndExpectDuplicatePrevented(
  page: Page,
  app: AppConfig,
) {
  const envSeed = getLeadFlowSeed(app.envName);
  const sourcePreferences = preferStandardLeadSources(envSeed.fallbackSourcePreferences);
  const originalLead = buildLeadSeed(app.envName);
  originalLead.projectName = app.activeProjectName;

  await prepareLeadFormWithSeed(page, app, originalLead, sourcePreferences);
  await base.step("Save lead", async () => {
    await saveLeadFormAndWaitForClose(page);
  });
  await goToManageLeads(page, app);
  await assertLeadCreated(page, originalLead.fullName, originalLead.projectName);

  const duplicateLead = buildLeadSeed(app.envName);
  duplicateLead.projectName = originalLead.projectName;
  duplicateLead.whatsappNumber = originalLead.whatsappNumber;

  await waitForListingReady(page);

  const apiFieldsPromise = waitForLeadFormApiFields(page).catch(() => []);
  await openLeadCreationForm(page);

  const [apiFields, domMandatoryFields] = await Promise.all([
    apiFieldsPromise,
    collectMandatoryFieldsFromDom(page),
  ]);
  const fields = dedupeLeadFields([...apiFields, ...domMandatoryFields]);
  await fillCoreLeadFields(page, duplicateLead, app, sourcePreferences);

  if (!(await waitForDuplicateLeadBusinessRule(page))) {
    await fillAdaptiveLeadFields(
      page,
      fields,
      duplicateLead,
      app,
      sourcePreferences,
    );

    if (!(await waitForDuplicateLeadBusinessRule(page, 3000))) {
      await base.step("Save duplicate lead", async () => {
        const leadFormPage = new LeadFormPage(page);
        await expect(leadFormPage.saveButton).toBeVisible({ timeout: 30000 });
        await leadFormPage.saveButton.click();
      });
    }
  }

  await expectDuplicateLeadBusinessRule(page);

  return { originalLead, duplicateLead };
}

async function getOpenedLeadStage(page: Page) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const leadStageMatch = bodyText.match(
    /Lead Stage\s*:\s*([A-Za-z ]+?)(?=\s+(?:Site Visit Scheduled|Site Revisit Scheduled|Dropped Reason|CP Phone|CP Agent Phone|$))/i,
  );
  if (leadStageMatch?.[1]?.trim()) {
    return leadStageMatch[1].trim();
  }

  for (const stage of CHANGE_STAGE_OPTION_PRIORITY) {
    if (new RegExp(`\\b${escapeRegex(stage)}\\b`, "i").test(bodyText)) {
      return stage;
    }
  }

  return "Unknown";
}

async function getAvailableChangeStageOptions(page: Page, currentStage: string) {
  const options = await page.evaluate(
    ({ priorities, current }) => {
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const isVisible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      };

      const stageScopes = Array.from(document.querySelectorAll<HTMLElement>("section, article, div"))
        .filter((element) => {
          const text = normalize(element.innerText || element.textContent);
          return isVisible(element) && /Choose a stage|Choose a sub stage|Status/i.test(text);
        })
        .sort((left, right) => normalize(left.innerText).length - normalize(right.innerText).length);

      const scope = stageScopes[0];
      if (!scope) {
        return [];
      }

      const exactOptions = new Set(priorities);
      const currentText = normalize(current).toLowerCase();
      const available = Array.from(scope.querySelectorAll<HTMLElement>("button, [role='button'], p, span, div"))
        .map((element) => normalize(element.innerText || element.textContent))
        .filter((text) =>
          exactOptions.has(text) &&
          text.toLowerCase() !== currentText &&
          !/^(Cancel|Save)$/i.test(text),
        );

      return Array.from(new Set(available));
    },
    { priorities: CHANGE_STAGE_OPTION_PRIORITY, current: currentStage },
  );

  return CHANGE_STAGE_OPTION_PRIORITY.filter((option) => options.includes(option));
}

async function changeOpenedLeadToAnyAvailableStage(
  page: Page,
  remark: string,
): Promise<AppliedStageChange> {
  const previousStage = await getOpenedLeadStage(page);
  await openChangeStageTab(page);

  const availableStages = await getAvailableChangeStageOptions(page, previousStage);
  if (!availableStages.length) {
    const panelText = await visibleChangeStageText(page);
    throw new Error(
      `No alternate stage option was available. Current stage: "${previousStage}". Panel text: "${panelText}".`,
    );
  }

  const updatedStage = availableStages[0];
  await base.step(`Change lead stage to ${updatedStage}`, async () => {
    await clickVisibleStageAction(
      page,
      new RegExp(`^${escapeRegex(updatedStage)}$`, "i"),
    );
    await fillVisibleStageFields(page, remark);

    const saved = await clickVisibleSaveButton(page);
    if (!saved) {
      throw new Error(
        `Save button was not visible after selecting stage "${updatedStage}".`,
      );
    }
  });

  await base.step("Verify changed stage is reflected", async () => {
    await expect
      .poll(
        async () => {
          const bodyText = await page.locator("body").innerText().catch(() => "");
          return new RegExp(`\\b${escapeRegex(updatedStage)}\\b`, "i").test(bodyText);
        },
        { timeout: 60000 },
      )
      .toBeTruthy();
  });

  return { previousStage, updatedStage };
}

export async function assertLeadCreated(
  page: Page,
  leadName: string,
  projectName: string,
) {
  await logStep("Verify lead created");
  const leadListPage = new LeadListPage(page);
  await leadListPage.selectProjectForLeadSearch(projectName);
  await leadListPage.expectLeadVisible(leadName);
}

export async function assertLeadSearchableByContactDetails(page: Page, leadSeed: LeadSeed) {
  const leadListPage = new LeadListPage(page);
  const searches = [
    { label: "name", value: leadSeed.fullName },
    { label: "phone number", value: leadSeed.whatsappNumber },
    { label: "email id", value: leadSeed.email },
  ];

  for (const search of searches) {
    await base.step(`Search lead by ${search.label}`, async () => {
      await leadListPage.expectLeadVisibleForSearch(search.value, leadSeed.fullName);
    });
  }
}

export async function openLeadByName(page: Page, leadName: string) {
  await logStep("Open created lead");
  await new LeadListPage(page).openLeadByName(leadName);
  await waitForLeadProfile(page);
}

async function clickFirstVisible(page: Page, locators: Locator[]) {
  for (const locator of locators) {
    if (
      await locator
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await locator.first().click();
      return true;
    }
  }

  return false;
}

async function clickNestedAddLeadAction(page: Page) {
  const nestedAddLeadCandidates = [
    page
      .locator("button")
      .filter({ hasText: /^Add Lead$/i })
      .last(),
    page
      .locator('[role="menuitem"]')
      .filter({ hasText: /^Add Lead$/i })
      .last(),
    page
      .locator("div")
      .filter({ hasText: /^Add Lead$/i })
      .last(),
    page.getByText("Add Lead", { exact: true }).last(),
  ];

  for (const candidate of nestedAddLeadCandidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ force: true });
      return true;
    }
  }

  return false;
}

async function waitForLeadListingContent(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});

  await expect
    .poll(
      async () => {
        const bodyText = await page.locator("body").innerText();
        return /Lead ID|No leads|Follow Up|Site Visit|Opportunity|Channel Partner|Direct Site Visit/i.test(
          bodyText,
        );
      },
      { timeout: 60000 },
    )
    .toBeTruthy();
}

async function waitForManageConstructionContent(page: Page) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});

  await expect
    .poll(
      async () => {
        const currentUrl = page.url();
        const bodyText = (await page.locator("body").innerText().catch(() => ""))
          .replace(/\s+/g, " ")
          .trim();
        const hasManageConstructionShell = await page
          .getByRole("heading", { name: /Manage Construction/i })
          .first()
          .isVisible()
          .catch(() => false);
        const hasLandingModules = await page
          .getByText(/Schedule Control|Site Tracker|Saved Reports/i)
          .first()
          .isVisible()
          .catch(() => false);

        return (
          /\/admin\/developer\/cpms\/manage-construction/i.test(currentUrl) &&
          (hasManageConstructionShell ||
            hasLandingModules ||
            /Manage Construction/i.test(bodyText))
        );
      },
      { timeout: 30000 },
    )
    .toBeTruthy();
}

async function waitForListingReady(page: Page) {
  await waitForLeadListingContent(page);

  const addLeadButton = page.getByText("Add Lead", { exact: true });
  const addLeadVisible = await expect
    .poll(
      async () => {
        if (await addLeadButton.first().isVisible().catch(() => false)) {
          return true;
        }

        await page.getByRole("tab", { name: /Lead Listing/i }).click().catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        return await addLeadButton.first().isVisible().catch(() => false);
      },
      { timeout: 60000 },
    )
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);

  if (!addLeadVisible) {
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await waitForLeadListingContent(page);
  }

  await expect(addLeadButton.first()).toBeVisible({ timeout: 30000 });
  await expect(addLeadButton).toBeEnabled({ timeout: 60000 });
  await page.waitForTimeout(1500);
}

async function waitForLeadProfile(page: Page) {
  await new LeadProfilePage(page).expectLoaded();
}

export async function openAnyLeadFromListing(page: Page, app: AppConfig) {
  await logStep("Open existing lead");
  await goToManageLeads(page, app);
  await page.waitForTimeout(3000);
  await waitForListingReady(page);
  await page.waitForTimeout(2000);

  const firstProfileHref = await page
    .locator('a[href*="engagement-intelligence/manage-leads"][href*="id="]')
    .evaluateAll((links) => {
      const visible = (element: Element) => {
        const htmlElement = element as HTMLElement;
        const rect = htmlElement.getBoundingClientRect();
        const style = window.getComputedStyle(htmlElement);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const link = links.find(visible) ?? links[0];
      return link?.getAttribute("href") ?? "";
    })
    .catch(() => "");

  if (firstProfileHref) {
    await page.goto(new URL(firstProfileHref, page.url()).toString(), {
      waitUntil: "domcontentloaded",
    });
    await waitForLeadProfile(page);
    return;
  }

  const openedFromKnownLink = await clickFirstVisible(page, [
    page.locator('a[href*="engagement-intelligence/manage-leads"][href*="id="]'),
    page.locator('a[href*="/manage-leads"][href*="id="]'),
    page.getByText(/^L\d+/, { exact: false }),
    page.getByText(/Lead ID/i),
  ]);

  if (!openedFromKnownLink) {
    const openedFromFallback = await clickFirstVisible(page, [
      page.locator("table tbody tr td").filter({ hasText: /[A-Za-z]/ }),
      page.locator('[role="row"]').nth(1),
      page.locator("tbody tr").first(),
    ]);

    if (!openedFromFallback) {
      throw new Error("No lead row was available to open from the listing.");
    }
  }

  await waitForLeadProfile(page);
}

export async function editOpenedLeadName(
  page: Page,
  nextName?: string,
): Promise<EditedLead> {
  await logStep("Open edit lead form");
  return await new LeadProfilePage(page).editLeadName(nextName);
}

export async function addRemarkToOpenedLead(
  page: Page,
  remarkText?: string,
): Promise<AddedRemark> {
  await logStep("Add remark");
  return await new LeadProfilePage(page).addRemark(remarkText);
}

export async function assertGenerateCostSheetRenderingOnOpenedLead(
  page: Page,
): Promise<CostSheetRenderResult> {
  await logStep("Open generated cost sheet preview");
  return await new LeadProfilePage(page).openGeneratedCostSheetPreview();
}

export async function assertAddCommentPanelOnOpenedLead(
  page: Page,
): Promise<CommentPanelResult> {
  await logStep("Open add comment panel");
  const leadProfilePage = new LeadProfilePage(page);
  const result = await leadProfilePage.openAddCommentPanel();
  await leadProfilePage.expectAddCommentPanelOptionsVisible();
  return result;
}

export async function saveCommentWithRecordingOnOpenedLead(page: Page, recordingPath: string) {
  await logStep("Save add comment with recording upload");
  return await new LeadProfilePage(page).saveCommentWithRecording(recordingPath);
}

export async function assignLeadFromListingToAvailableUser(page: Page, app: AppConfig) {
  await logStep("Assign lead from listing");
  const leadListPage = new LeadListPage(page);
  await leadListPage.openManageLeads(app);
  return await leadListPage.assignFirstVisibleLeadToAvailableUserAndVerify();
}

export async function openLeadWhatsAppIntegrationFromListing(page: Page, app: AppConfig) {
  await logStep("Open lead WhatsApp integration from listing");
  const leadListPage = new LeadListPage(page);
  await leadListPage.openManageLeads(app);
  return await leadListPage.openFirstVisibleLeadWhatsAppIntegrationAndVerify();
}

export async function addReEnquiryToOpenedLead(
  page: Page,
  source = "Direct Site Visit",
  subSource = "Walk In",
): Promise<ReEnquiryResult> {
  await logStep("Add re-enquiry");
  return await new LeadProfilePage(page).addReEnquiry(source, subSource);
}

export async function moveOpenedLeadToSiteVisitInProgress(
  page: Page,
  leadName: string,
  otpMode: SiteVisitOtpMode = "otp",
) {
  await logStep("Move site visit to in progress");
  await ensureLeadProfileIsOpen(page, leadName);

  if (await isLeadAlreadyInSiteVisitProgress(page, leadName)) {
    return;
  }

  await openChangeStageTab(page);

  await expect(page.getByText("Choose a stage", { exact: true })).toBeVisible({
    timeout: 30000,
  });

  const inProgressOption = page.getByText(/^In Progress$/i).last();
  await expect(inProgressOption).toBeVisible({ timeout: 30000 });
  await inProgressOption.click({ force: true });

  if (await clickStartSiteVisitCta(page)) {
    // Direct Site Visit / Walk In leads can enter the visit immediately.
    // In that case the application does not render an OTP step.
    const startOutcome = await waitForSiteVisitStartOutcome(page, leadName);
    if (startOutcome === "otp") {
      await completeSiteVisitStartAuthentication(page, otpMode);
    } else if (startOutcome === "not-ready") {
      await saveInProgressStageDetails(page);
    }
  } else {
    await saveInProgressStageDetails(page);
  }

  await expectSiteVisitInProgress(page, leadName);
}

async function isLeadAlreadyInSiteVisitProgress(page: Page, leadName: string) {
  if (await page
    .getByRole("button", { name: /end visit/i })
    .first()
    .isVisible()
    .catch(() => false)) {
    return true;
  }

  const statusText = await visibleLeadStatusCardText(page, leadName);
  return /Site Visit/i.test(statusText) && /In Progress/i.test(statusText);
}

async function waitForSiteVisitStartOutcome(page: Page, leadName: string) {
  return await expect
    .poll(
      async () => {
        if (await isLeadAlreadyInSiteVisitProgress(page, leadName)) {
          return "in-progress";
        }

        const otpVisible = await page
          .getByRole("button", { name: /send otp/i })
          .first()
          .isVisible()
          .catch(() => false);
        return otpVisible ? "otp" : "";
      },
      { timeout: 15000 },
    )
    .not.toBe("")
    .then(async () => {
      if (await isLeadAlreadyInSiteVisitProgress(page, leadName)) {
        return "in-progress" as const;
      }
      return "otp" as const;
    })
    .catch(() => "not-ready" as const);
}

async function clickStartSiteVisitCta(page: Page) {
  const startSiteVisitLocators = [
    page.getByRole("button", { name: /start site visit/i }).first(),
    page.locator("button, [role='button'], a").filter({ hasText: /start site visit/i }).first(),
    page.getByText(/start site visit/i).first(),
  ];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    for (const locator of startSiteVisitLocators) {
      if (await locator.isVisible().catch(() => false)) {
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.click({ force: true });
        await page.waitForTimeout(1500);
        return true;
      }
    }

    const clickedWithDom = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], a, div, span"));
      const target = elements.find((element) => {
        const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          /start site visit/i.test(text) &&
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      });

      const clickable = target?.closest<HTMLElement>("button, [role='button'], a") || target;
      if (!clickable) {
        return false;
      }

      clickable.scrollIntoView({ block: "center", inline: "center" });
      clickable.click();
      return true;
    });

    if (clickedWithDom) {
      await page.waitForTimeout(1500);
      const authActionVisible = await page
        .locator("button, [role='button'], a")
        .filter({ hasText: /^(skip|send otp|visit in progress)$/i })
        .first()
        .isVisible()
        .catch(() => false);
      if (authActionVisible) {
        return true;
      }
    }

    const scrolled = await scrollStageFormSection(page);
    if (!scrolled) {
      await wheelRightStagePane(page);
    }
    await page.waitForTimeout(300);
  }

  return false;
}

async function completeSiteVisitStartAuthentication(page: Page, otpMode: SiteVisitOtpMode) {
  if (otpMode === "skip") {
    const skipped = await base.step("Skip site visit OTP", async () => {
      const clickedWithDom = await clickVisibleTextActionWithDom(page, /^skip$/i);
      if (clickedWithDom) {
        return true;
      }

      const skipButton = await findVisibleAction(page, /^skip$/i, false);
      if (!skipButton) {
        return false;
      }

      await skipButton.click({ force: true });
      return true;
    });

    if (skipped && await confirmVisitInProgress(page)) {
      return;
    }

    if (await findVisibleAction(page, /^send otp$/i, false)) {
      await completeVisibleOtpAuthentication(page);
      return;
    }

    if (!skipped) {
      await saveInProgressStageDetails(page);
    }
    return;
  }

  await completeVisibleOtpAuthentication(page);
}

async function confirmVisitInProgress(page: Page) {
  return await base.step("Confirm visit in progress", async () => {
    await page.waitForTimeout(700);

    const visitInProgress = await findVisibleAction(page, /visit in progress/i, false);
    if (visitInProgress) {
      await visitInProgress.click({ force: true }).catch(() => {});
      return true;
    }

    return await clickVisibleTextActionWithDom(page, /visit in progress/i);
  });
}

async function saveInProgressStageDetails(page: Page) {
  await base.step("Save in-progress stage details", async () => {
    await fillVisibleStageFields(page, "automation started site visit.");
    const saved = await clickVisibleSaveButton(page, /Stage Updated to Opportunity|Lead Stage Changed/i);
    if (!saved) {
      throw new Error('Save button was not visible after selecting "In Progress" site visit condition.');
    }
  });
}

async function completeVisibleOtpAuthentication(page: Page) {
  await logStep("Send site visit OTP");
  const sentOtp = await clickVisibleTextActionWithDom(page, /^send otp$/i);
  if (!sentOtp) {
    const sendOtpButton = await findVisibleAction(page, /^send otp$/i);
    if (!sendOtpButton) {
      throw new Error('"Send OTP" action was not visible while starting the site visit.');
    }
    await sendOtpButton.click({ force: true });
  }

  await scrollStageFormSection(page, 1);
  await page.mouse.wheel(0, 500).catch(() => {});
  await page.waitForTimeout(700);

  const otpDigits = ["1", "2", "3", "4"];
  await base.step("Enter site visit OTP", async () => {
    for (const [index, digit] of otpDigits.entries()) {
      const otpInput = await findVisibleOtpInput(page, index);
      await otpInput.fill(digit);
    }
  });

  await base.step("Submit site visit OTP", async () => {
    const continueButton = await findVisibleAction(page, /continue/i);
    if (!continueButton) {
      throw new Error('"Continue" action was not visible after entering the site visit OTP.');
    }
    await continueButton.click({ force: true });
  });

  await confirmVisitInProgress(page);
}

async function completeOpenedSiteVisit(
  page: Page,
  leadName: string,
  otpMode: SiteVisitOtpMode,
) {
  await logStep("Complete site visit");
  await page.reload({ waitUntil: "networkidle" });
  await waitForLeadProfile(page);
  await openChangeStageTab(page);

  let endVisitButton = await findVisibleAction(page, /^end visit$/i, false);
  if (!endVisitButton && otpMode === "skip") {
    await moveOpenedLeadToSiteVisitInProgress(page, leadName, "skip");
    await page.reload({ waitUntil: "networkidle" });
    await waitForLeadProfile(page);
    await openChangeStageTab(page);
    endVisitButton = await findVisibleAction(page, /^end visit$/i, false);
  }

  if (!endVisitButton) {
    throw new Error('End Visit button was not visible after opening the Change Stage form.');
  }

  await endVisitButton.click({ force: true });
  let completedStatus = await findVisibleAction(page, /^site visit completed$/i, false);
  if (!completedStatus) {
    await ensureLeadProfileIsOpen(page, leadName);
    await openChangeStageTab(page);
    completedStatus = await findVisibleAction(page, /^site visit completed$/i, false);
  }

  if (!completedStatus) {
    throw new Error('"Site Visit Completed" status was not visible after ending the visit.');
  }
  await completedStatus.click({ force: true });

  const saved = await clickVisibleSaveButton(page, /Site Visit Completed|Visit Done|Lead Stage Changed/i);
  if (!saved && !(await isSiteVisitDoneApplied(page, leadName, 10000))) {
    throw new Error("Site Visit Completed outcome was not saved and no Save button was visible.");
  }

  await waitForSiteVisitDoneToPersist(page, leadName);
}

export async function completeOpenedSiteVisitWithOtp(page: Page, leadName: string) {
  await completeOpenedSiteVisit(page, leadName, "otp");
}

export async function completeOpenedSiteVisitWithSkip(page: Page, leadName: string) {
  await completeOpenedSiteVisit(page, leadName, "skip");
}

async function expectSiteVisitDone(page: Page, leadName: string) {
  await expect
    .poll(
      async () => await hasSiteVisitDoneState(page, leadName),
      { timeout: 60000 },
    )
    .toBeTruthy();
}

async function waitForSiteVisitDoneToPersist(page: Page, leadName: string) {
  await expectSiteVisitDone(page, leadName);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await ensureLeadProfileIsOpen(page, leadName);

  await expect
    .poll(
      async () => await hasSiteVisitDoneState(page, leadName),
      { timeout: 45000 },
    )
    .toBeTruthy();
}

async function isSiteVisitDoneApplied(page: Page, leadName: string, timeout = 5000) {
  return await expect
    .poll(
      async () => await hasSiteVisitDoneState(page, leadName),
      { timeout },
    )
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
}

async function hasSiteVisitDoneState(page: Page, leadName: string) {
  const leadStatusPattern = new RegExp(
    `${escapeRegex(leadName)}[\\s\\S]{0,700}Site Visit[\\s\\S]{0,300}Visit Done`,
    "i",
  );
  const statusText = await visibleLeadStatusCardText(page, leadName);
  if (leadStatusPattern.test(statusText) || /Visit Done/i.test(statusText)) {
    return true;
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  return leadStatusPattern.test(bodyText) || /Stage Updated to Site Visit Completed|Lead Stage Changed Successfully/i.test(bodyText);
}

export async function markOpenedSiteVisitNoShow(page: Page, leadName: string) {
  await logStep("Mark site visit as no show");
  await openChangeStageTab(page);

  await clickVisibleStageAction(page, /^no show$/i);

  await fillVisibleStageFields(page, "automation marked site visit as no show.");

  if (!(await isSiteVisitNoShowApplied(page, leadName))) {
    const saved = await clickVisibleSaveButton(page);
    if (!saved && !(await isSiteVisitNoShowApplied(page, leadName, 10000))) {
      throw new Error("No Show site visit outcome was not saved and no Save button was visible.");
    }
  }

  await expectSiteVisitNoShow(page, leadName);
}

async function isSiteVisitNoShowApplied(page: Page, leadName: string, timeout = 5000) {
  return await expect
    .poll(
      async () => await hasSiteVisitNoShowState(page, leadName),
      { timeout },
    )
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
}

async function expectSiteVisitNoShow(page: Page, leadName: string) {
  await expect
    .poll(
      async () => await hasSiteVisitNoShowState(page, leadName),
      { timeout: 60000 },
    )
    .toBeTruthy();
}

async function hasSiteVisitNoShowState(page: Page, leadName: string) {
  const leadStatusPattern = new RegExp(
    `${escapeRegex(leadName)}[\\s\\S]{0,700}Site Visit[\\s\\S]{0,300}No Show`,
    "i",
  );
  const statusText = await visibleLeadStatusCardText(page, leadName);
  if (leadStatusPattern.test(statusText)) {
    return true;
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  return leadStatusPattern.test(bodyText) || /Stage Updated to No Show|Lead Stage Changed Successfully/i.test(bodyText);
}

export async function moveCompletedSiteVisitToOpportunity(page: Page, leadName: string) {
  await logStep("Move lead to opportunity");
  await base.step("Ensure lead profile is open", async () => {
    await ensureLeadProfileIsOpen(page, leadName);
  });

  await base.step("Open Change Stage tab", async () => {
    await openChangeStageTab(page);
  });

  await base.step("Select Opportunity stage", async () => {
    await clickOpportunityStageOption(page);
  });

  await base.step("Enter Opportunity remark and follow-up date", async () => {
    await fillOpportunityStageFields(page, "Automation lead move to opportunity");
  });

  if (!(await isSiteVisitOpportunityApplied(page, leadName))) {
    await base.step("Save Opportunity stage", async () => {
      const saved = await clickVisibleSaveButton(page, /Stage Updated to Opportunity|Lead Stage Changed/i);
      if (!saved && !(await isSiteVisitOpportunityApplied(page, leadName, 10000))) {
        throw new Error('Opportunity stage was not saved and no Save button was visible.');
      }
    });
  }

  await base.step("Verify lead moved to Opportunity", async () => {
    await expectSiteVisitOpportunity(page, leadName);
  });
}


async function clickOpportunityStageOption(page: Page) {
  await resetStageFormScroll(page);

  const chooseStage = page.getByText("Choose a stage", { exact: true }).first();
  await expect(chooseStage).toBeVisible({ timeout: 30000 });

  const result = await clickOpportunityStageUntilReady(page);
  if (result === "ready") {
    return;
  }

  if (result === "contact-required") {
    throw new Error(
      'The app rejected Opportunity stage because the lead is not contacted yet. Add a contacted/call outcome step before moving this site visit lead to Opportunity.',
    );
  }

  const visibleStageText = await visibleChangeStageText(page);
  throw new Error(`Opportunity stage was clicked, but the Opportunity details form did not open. Visible stage text: ${visibleStageText}`);
}

async function clickOpportunityStageUntilReady(page: Page) {
  const attempts: Array<() => Promise<boolean>> = [
    async () => {
      const opportunityFromCodegen = page.getByText("Opportunity", { exact: true }).nth(1);
      await revealLocator(page, opportunityFromCodegen);
      await opportunityFromCodegen.click();
      return true;
    },
    async () => {
      const opportunityFromCodegen = page.getByText("Opportunity", { exact: true }).nth(1);
      await revealLocator(page, opportunityFromCodegen);
      await opportunityFromCodegen.click({ force: true });
      return true;
    },
    async () => await clickStageChipInChangeStagePanel(page, "Opportunity"),
    async () => {
      const opportunityFromCodegen = page.getByText("Opportunity", { exact: true }).nth(1);
      await revealLocator(page, opportunityFromCodegen);
      const box = await opportunityFromCodegen.boundingBox();
      if (!box) {
        return false;
      }
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      return true;
    },
  ];

  for (const attempt of attempts) {
    await resetStageFormScroll(page);
    const clicked = await attempt().catch(() => false);
    if (!clicked) {
      continue;
    }

    const selectionResult = await waitForOpportunityStageSelection(page);
    if (selectionResult !== "not-ready") {
      return selectionResult;
    }
  }

  return "not-ready" as const;
}

async function waitForOpportunityStageSelection(page: Page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isOpportunityDetailsFormVisible(page)) {
      return "ready" as const;
    }

    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (/New Lead Not Contacted|not been contacted yet/i.test(bodyText)) {
      return "contact-required" as const;
    }

    await page.waitForTimeout(500);
  }

  return "not-ready" as const;
}

async function isOpportunityDetailsFormVisible(page: Page) {
  return (
    (await page.getByRole("textbox", { name: /remarks?\s*\*/i }).first().isVisible().catch(() => false)) ||
    (await page.getByRole("textbox", { name: /remarks?/i }).first().isVisible().catch(() => false)) ||
    (await page.locator('textarea[placeholder*="Remark" i]').first().isVisible().catch(() => false)) ||
    (await page.locator('textarea[name*="remark" i]').first().isVisible().catch(() => false)) ||
    (await page.locator("textarea").first().isVisible().catch(() => false))
  );
}

async function clickStageChipInChangeStagePanel(page: Page, stageName: string) {
  return await page.evaluate((targetStageName) => {
    const normalize = (value: string | null | undefined) =>
      (value || "").replace(/\s+/g, " ").trim();

    const isVisible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.pointerEvents !== "none"
      );
    };

    const stageHeading = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, p, span, div"))
      .find((element) => normalize(element.innerText || element.textContent) === "Choose a stage" && isVisible(element));
    if (!stageHeading) {
      return false;
    }

    const stageScopeCandidates: HTMLElement[] = [];
    let current: HTMLElement | null = stageHeading.parentElement;
    for (let depth = 0; current && depth < 8; depth += 1) {
      const text = normalize(current.innerText || current.textContent);
      if (/New Lead/i.test(text) && /Site Visit/i.test(text) && /Opportunity/i.test(text)) {
        stageScopeCandidates.push(current);
      }
      current = current.parentElement;
    }

    const stageScope = stageScopeCandidates
      .sort((left, right) => normalize(left.innerText).length - normalize(right.innerText).length)[0];
    if (!stageScope) {
      return false;
    }

    const matches = Array.from(stageScope.querySelectorAll<HTMLElement>("button, [role='button'], a, p, span, div"))
      .filter((element) => normalize(element.innerText || element.textContent) === targetStageName && isVisible(element))
      .sort((left, right) => {
        const leftStyle = window.getComputedStyle(left);
        const rightStyle = window.getComputedStyle(right);
        const leftPriority = left.matches("button, [role='button'], a") || leftStyle.cursor === "pointer" ? 0 : 1;
        const rightPriority = right.matches("button, [role='button'], a") || rightStyle.cursor === "pointer" ? 0 : 1;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        return normalize(left.innerText || left.textContent).length - normalize(right.innerText || right.textContent).length;
      });

    const target = matches[0];
    if (!target) {
      return false;
    }

    let clickable: HTMLElement | null = target;
    let parent = target.parentElement;
    for (let depth = 0; parent && depth < 4; depth += 1) {
      const parentText = normalize(parent.innerText || parent.textContent);
      const parentStyle = window.getComputedStyle(parent);
      if (parentText === targetStageName && (parent.matches("button, [role='button'], a") || parentStyle.cursor === "pointer")) {
        clickable = parent;
        break;
      }
      parent = parent.parentElement;
    }

    const scrollParents: HTMLElement[] = [];
    parent = clickable.parentElement;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      if (parent.scrollHeight > parent.clientHeight && /(auto|scroll|overlay)/.test(style.overflowY)) {
        scrollParents.push(parent);
      }
      parent = parent.parentElement;
    }

    for (const container of scrollParents.reverse()) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = clickable.getBoundingClientRect();
      container.scrollTop +=
        targetRect.top -
        containerRect.top -
        Math.max(24, Math.floor((container.clientHeight - targetRect.height) / 2));
    }

    clickable.scrollIntoView({ block: "center", inline: "center" });
    clickable.click();
    return true;
  }, stageName);
}

async function fillOpportunityStageFields(page: Page, remark: string) {
  const remarkFilled = await fillFirstVisibleStageField(
    page,
    [
      page.getByRole("textbox", { name: /remarks?\s*\*/i }).first(),
      page.getByRole("textbox", { name: /remarks?/i }).first(),
      page.locator('textarea[placeholder*="Remark" i]').first(),
      page.locator('textarea[name*="remark" i]').first(),
      page.locator("textarea").first(),
    ],
    remark,
  );
  if (!remarkFilled) {
    throw new Error('Remarks field was not visible after selecting "Opportunity".');
  }

  const dateSelected = await selectOpportunityFollowUpDate(page);
  if (!dateSelected) {
    throw new Error('Start Date field was not visible after selecting "Opportunity".');
  }
}

async function isSiteVisitOpportunityApplied(page: Page, leadName: string, timeout = 5000) {
  return await expect
    .poll(
      async () => await hasSiteVisitOpportunityState(page, leadName),
      { timeout },
    )
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
}

async function expectSiteVisitOpportunity(page: Page, leadName: string) {
  await expect
    .poll(
      async () => await hasSiteVisitOpportunityState(page, leadName),
      { timeout: 60000 },
    )
    .toBeTruthy();
}

async function hasSiteVisitOpportunityState(page: Page, leadName: string) {
  const leadStatusPattern = new RegExp(
    `${escapeRegex(leadName)}[\\s\\S]{0,700}Opportunity`,
    "i",
  );
  const statusText = await visibleLeadStatusCardText(page, leadName);
  if (leadStatusPattern.test(statusText) || /Opportunity/i.test(statusText)) {
    return true;
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (/Stage Updated to Opportunity/i.test(bodyText)) {
    return true;
  }

  return await hasOpportunityInLeadListing(page, leadName);
}

async function hasOpportunityInLeadListing(page: Page, leadName: string) {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const searchInput = page
    .getByRole("textbox", { name: /Search by name, number, email, or ID|Search by name, number, email/i })
    .first();
  if (!(await searchInput.isVisible().catch(() => false))) {
    return false;
  }

  const currentValue = await searchInput.inputValue().catch(() => "");
  if (normalize(currentValue) !== normalize(leadName)) {
    await searchInput.fill(leadName).catch(() => {});
    await searchInput.press("Enter").catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  }

  const rowTexts = await page
    .locator("tbody tr, [role='row']")
    .evaluateAll((rows) =>
      rows
        .map((row) => (row.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean),
    )
    .catch(() => []);

  return rowTexts.some((rowText) =>
    new RegExp(`${escapeRegex(leadName)}[\\s\\S]{0,700}Opportunity`, "i").test(rowText),
  );
}

async function ensureLeadProfileIsOpen(page: Page, leadName: string) {
  if (await isLeadProfileOpen(page, leadName)) {
    return;
  }

  await openLeadByName(page, leadName);
  await waitForLeadProfile(page);
}

async function isLeadProfileOpen(page: Page, leadName: string) {
  return await page
    .locator("body")
    .innerText({ timeout: 5000 })
    .then((bodyText) => (
      bodyText.includes(leadName) &&
      /Lead Profile/i.test(bodyText) &&
      /Change Stage/i.test(bodyText)
    ))
    .catch(() => false);
}

async function findVisibleOtpInput(page: Page, index: number) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const labelledInput = page
      .getByRole("textbox", { name: new RegExp(`^${index + 1}$`) })
      .first();
    if (await labelledInput.isVisible().catch(() => false)) {
      await labelledInput.scrollIntoViewIfNeeded().catch(() => {});
      return labelledInput;
    }

    const rawOtpInput = page
      .locator('input[inputmode="numeric"], input[maxlength="1"]')
      .nth(index);
    if (await rawOtpInput.isVisible().catch(() => false)) {
      await rawOtpInput.scrollIntoViewIfNeeded().catch(() => {});
      return rawOtpInput;
    }

    const direction = attempt < 8 ? 1 : -1;
    const scrolled = await scrollStageFormSection(page, direction);
    if (!scrolled) {
      await page.mouse.wheel(0, direction * 500).catch(() => {});
    }
    await page.waitForTimeout(350);
  }

  throw new Error(`OTP digit ${index + 1} input was not visible after scrolling the site visit section.`);
}

async function findVisibleAction(page: Page, name: RegExp, required = true) {
  const actions = [
    page.getByRole("button", { name }),
    page.locator("button, [role='button'], a").filter({ hasText: name }),
    page.getByText(name),
  ];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    for (const locator of actions) {
      const count = Math.min(await locator.count().catch(() => 0), 40);
      for (let index = 0; index < count; index += 1) {
        const action = locator.nth(index);
        await revealLocator(page, action);
        if (await action.isVisible().catch(() => false)) {
          return action;
        }
      }
    }

    const direction = attempt < 8 ? 1 : -1;
    const scrolled = await scrollStageFormSection(page, direction);
    if (!scrolled) {
      await page.mouse.wheel(0, direction * 500).catch(() => {});
    }
    await page.waitForTimeout(350);
  }

  if (!required) {
    return null;
  }

  throw new Error(`Action matching ${name} was not visible after scrolling the site visit section.`);
}

async function clickVisibleStageAction(page: Page, name: RegExp) {
  const source = name.source;
  const flags = name.flags;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const clicked = await page.evaluate(
      ({ source: patternSource, flags: patternFlags }) => {
        const matcher = new RegExp(patternSource, patternFlags);

        function normalize(value: string | null | undefined) {
          return (value || "").replace(/\s+/g, " ").trim();
        }

        function isVisible(element: HTMLElement) {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            style.pointerEvents !== "none"
          );
        }

        function stageScopeFor(element: HTMLElement) {
          let current: HTMLElement | null = element;
          for (let depth = 0; current && depth < 10; depth += 1) {
            const text = normalize(current.innerText || current.textContent);
            if (
              /Choose a stage|Choose a sub stage|Status/i.test(text) &&
              /Open|Qualified|Site Visit|Opportunity|Dropped|Booked|In Progress|No Show/i.test(text)
            ) {
              return current;
            }
            current = current.parentElement;
          }
          return null;
        }

        function reveal(element: HTMLElement) {
          const scrollableParents: HTMLElement[] = [];
          let parent = element.parentElement;
          while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            if (
              (parent.scrollHeight > parent.clientHeight && /(auto|scroll|overlay)/.test(style.overflowY)) ||
              (parent.scrollWidth > parent.clientWidth && /(auto|scroll|overlay)/.test(style.overflowX))
            ) {
              scrollableParents.push(parent);
            }
            parent = parent.parentElement;
          }

          for (const container of scrollableParents.reverse()) {
            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            container.scrollTop +=
              elementRect.top -
              containerRect.top -
              Math.max(24, Math.floor((container.clientHeight - elementRect.height) / 2));
            container.scrollLeft +=
              elementRect.left -
              containerRect.left -
              Math.max(0, Math.floor((container.clientWidth - elementRect.width) / 2));
          }

          element.scrollIntoView({ block: "center", inline: "nearest" });
        }

        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>("button, [role='button'], a, p, span, div"),
        ).filter((element) => {
          const text = normalize(element.innerText || element.textContent);
          return matcher.test(text) && Boolean(stageScopeFor(element));
        });

        candidates.sort((left, right) => {
          const leftTagPriority = /^(BUTTON|A)$/.test(left.tagName) || left.getAttribute("role") === "button" ? 0 : 1;
          const rightTagPriority = /^(BUTTON|A)$/.test(right.tagName) || right.getAttribute("role") === "button" ? 0 : 1;
          if (leftTagPriority !== rightTagPriority) {
            return leftTagPriority - rightTagPriority;
          }
          return normalize(left.innerText || left.textContent).length - normalize(right.innerText || right.textContent).length;
        });

        for (const candidate of candidates) {
          reveal(candidate);
          if (isVisible(candidate)) {
            candidate.click();
            return true;
          }
        }

        return false;
      },
      { source, flags },
    );

    if (clicked) {
      await page.waitForTimeout(500);
      return;
    }

    const direction = attempt < 8 ? 1 : -1;
    const scrolled = await scrollStageFormSection(page, direction);
    if (!scrolled) {
      await page.mouse.wheel(0, direction * 500).catch(() => {});
    }
    await page.waitForTimeout(350);
  }

  throw new Error(`Stage action matching ${name} was not visible inside the Change Stage form.`);
}

async function clickVisibleTextActionWithDom(page: Page, name: RegExp) {
  const source = name.source;
  const flags = name.flags;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const clicked = await page.evaluate(
      ({ source: patternSource, flags: patternFlags }) => {
        const matcher = new RegExp(patternSource, patternFlags);
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>("button, [role='button'], a, p, span, div"),
        );
        const matches = elements
          .map((element) => {
            const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
            return { element, text };
          })
          .filter(({ element, text }) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);

            return (
              matcher.test(text) &&
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== "hidden" &&
              style.display !== "none"
            );
          })
          .sort((left, right) => left.text.length - right.text.length);

        const target = matches[0]?.element;

        const clickable = target?.closest<HTMLElement>("button, [role='button'], a") || target;
        if (!clickable) {
          return false;
        }

        clickable.scrollIntoView({ block: "center", inline: "center" });
        clickable.click();
        return true;
      },
      { source, flags },
    );

    if (clicked) {
      await page.waitForTimeout(700);
      return true;
    }

    const direction = attempt < 8 ? 1 : -1;
    const scrolled = await scrollStageFormSection(page, direction);
    if (!scrolled) {
      await page.mouse.wheel(0, direction * 500).catch(() => {});
    }
    await page.waitForTimeout(350);
  }

  return false;
}

async function expectSiteVisitInProgress(page: Page, leadName: string) {
  await expect
    .poll(
      async () => {
        const statusText = await visibleLeadStatusCardText(page, leadName);
        return /Site Visit/i.test(statusText) && /In Progress/i.test(statusText);
      },
      { timeout: 60000 },
    )
    .toBeTruthy();
}

async function visibleLeadStatusCardText(page: Page, leadName: string) {
  return await page.evaluate((targetLeadName) => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const visibleElements = Array.from(document.querySelectorAll<HTMLElement>("article, section, aside, div"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const text = normalize(element.innerText || element.textContent || "");
        return { element, rect, style, text };
      })
      .filter(({ rect, style, text }) => (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        text.includes(targetLeadName) &&
        /Lead ID/i.test(text) &&
        /Site Visit/i.test(text)
      ))
      .sort((left, right) => left.text.length - right.text.length);

    return visibleElements[0]?.text || "";
  }, leadName);
}

export async function assertSiteVisitStageCasesOnOpenedLead(page: Page) {
  await logStep("Schedule site visit");
  await openChangeStageTab(page);

  if (await openedLeadAlreadyHasScheduledSiteVisit(page)) {
    return;
  }

  const siteVisitStage = page
    .locator("button, div")
    .filter({ hasText: /^Site Visit$/i })
    .last();
  await expect(siteVisitStage).toBeVisible({ timeout: 30000 });
  await clickWithFallback(
    page,
    siteVisitStage,
    async () =>
      await page
        .getByRole("button", { name: /start date/i })
        .first()
        .isVisible()
        .catch(() => false),
    { force: true },
  );

  await fillSiteVisitBookingFields(page);
  const booked = await clickVisibleSaveButton(page);
  if (!booked) {
    throw new Error(
      'Save button was not visible after selecting "Site Visit" and entering booking details.',
    );
  }

  await expect
    .poll(
      async () => {
        const bodyText = await page
          .locator("body")
          .innerText()
          .catch(() => "");
        return /Site Visit/i.test(bodyText);
      },
      { timeout: 60000 },
    )
    .toBeTruthy();
}

async function openedLeadAlreadyHasScheduledSiteVisit(page: Page) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return (
    /Lead Stage\s*:\s*Site Visit/i.test(bodyText) &&
    /Site Visit Scheduled\s*:\s*(?!-)(?=\S)/i.test(bodyText)
  );
}

export async function assertScheduledSiteVisitReady(page: Page, leadName: string) {
  await logStep("Verify scheduled site visit");
  await expect(page.locator("body")).toContainText(
    new RegExp(`${escapeRegex(leadName)}[\\s\\S]{0,700}Site Visit[\\s\\S]{0,300}Scheduled`, "i"),
    { timeout: 60000 },
  );

  const startSiteVisitCta = page
    .locator("button, [role='button'], a")
    .filter({ hasText: /start site visit/i })
    .first();

  if (!(await startSiteVisitCta.isVisible().catch(() => false))) {
    await page.mouse.wheel(0, 700).catch(() => {});
  }

  await expect
    .poll(
      async () => {
        const bodyText = await page.locator("body").innerText().catch(() => "");
        const ctaVisible = await startSiteVisitCta.isVisible().catch(() => false);
        return ctaVisible || /Site Visit\s+Scheduled|Scheduled/i.test(bodyText);
      },
      { timeout: 10000 },
    )
    .toBeTruthy();
}

function addDaysToCurrentDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function tomorrowIsoDate() {
  return addDaysToCurrentDate(1).toISOString().slice(0, 10);
}

function siteVisitIsoDate() {
  return addDaysToCurrentDate(3).toISOString().slice(0, 10);
}

function dateOptionName(daysAhead: number) {
  const date = addDaysToCurrentDate(daysAhead);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
    date,
  );
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    date,
  );
  const day = date.getDate();
  const remainder10 = day % 10;
  const remainder100 = day % 100;
  const suffix =
    remainder10 === 1 && remainder100 !== 11
      ? "st"
      : remainder10 === 2 && remainder100 !== 12
        ? "nd"
        : remainder10 === 3 && remainder100 !== 13
          ? "rd"
          : "th";

  return new RegExp(`^Choose ${weekday}, ${month} ${day}${suffix},`, "i");
}

async function fillFirstVisibleField(
  page: Page,
  locators: Locator[],
  value: string,
) {
  for (const locator of locators) {
    if (await locator.isVisible().catch(() => false)) {
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      return await fillWithFallback(locator, value);
    }
  }

  return false;
}

async function fillSiteVisitBookingFields(page: Page) {
  const startDateButton = page
    .getByRole("button", { name: /start date/i })
    .first();
  const remarkFieldCandidates = [
    page.getByRole("textbox", { name: /remarks/i }).first(),
    page.locator("textarea").first(),
    page.locator('input[name*="remark" i]').first(),
  ];
  const siteVisitDateLocators = [
    startDateButton,
    page.getByPlaceholder(/start date/i).first(),
    page.locator('input[id*="visit"][type="date" i]').first(),
    page.locator('input[name*="visit"][type="date" i]').first(),
    page.locator('input[placeholder*="visit" i]').first(),
    page.locator('input[id*="schedule"][type="date" i]').first(),
    page.locator('input[name*="schedule"][type="date" i]').first(),
    page.locator('input[placeholder*="date" i]').first(),
    page.locator('input[type="date"]').first(),
  ];

  const dateFieldVisible = await expect
    .poll(
      async () => {
        return await Promise.all(
          siteVisitDateLocators.map(
            async (locator) => await locator.isVisible().catch(() => false),
          ),
        );
      },
      { timeout: 4000 },
    )
    .toContain(true)
    .then(() => true)
    .catch(() => false);

  if (!dateFieldVisible) {
    await page.waitForTimeout(FALLBACK_RENDER_WAIT_MS);
  }

  const dateFilled = await selectSiteVisitDate(
    page,
    startDateButton,
    siteVisitDateLocators,
  );
  const remarkFilled = await fillSiteVisitRemark(
    page,
    remarkFieldCandidates,
    "user will come for site visit.",
  );

  if (!dateFilled || !remarkFilled) {
    throw new Error(
      "Site visit booking date or remarks were not ready after selecting Site Visit.",
    );
  }
}

async function selectSiteVisitDate(
  page: Page,
  startDateButton: Locator,
  locators: Locator[],
) {
  if (await startDateButton.isVisible().catch(() => false)) {
    await clickWithFallback(
      page,
      startDateButton,
      async () =>
        await page
          .getByRole("option", { name: dateOptionName(3) })
          .first()
          .isVisible()
          .catch(() => false),
    );

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const dateOption = page
        .getByRole("option", { name: dateOptionName(3) })
        .first();
      if (await dateOption.isVisible().catch(() => false)) {
        await dateOption.click({ force: true });
        return true;
      }

      const scrolled = await scrollVisiblePopup(page);
      if (!scrolled) {
        break;
      }
      await page.waitForTimeout(400);
    }
  }

  return await fillFirstVisibleField(page, locators, siteVisitIsoDate());
}

async function scrollVisiblePopup(page: Page) {
  const scrolled = await page.evaluate(() => {
    const selectors = [
      '[role="listbox"]',
      '[role="dialog"]',
      "#root-modal",
      '[class*="popover" i]',
      '[class*="calendar" i]',
      '[class*="dropdown" i]',
      '[class*="menu" i]',
    ];

    const candidates = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          element.scrollHeight > element.clientHeight
        );
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return rightRect.top - leftRect.top;
      });

    const target = candidates[0];
    if (!target) {
      return false;
    }

    const before = target.scrollTop;
    target.scrollTop += Math.max(180, Math.floor(target.clientHeight * 0.8));
    return target.scrollTop !== before;
  });

  if (scrolled) {
    return true;
  }

  await page.mouse.wheel(0, 400).catch(() => {});
  return false;
}

async function fillSiteVisitRemark(
  page: Page,
  locators: Locator[],
  remark: string,
) {
  for (const locator of locators) {
    if (!(await locator.isVisible().catch(() => false))) {
      continue;
    }

    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click().catch(() => {});
    await locator.fill(remark);
    return true;
  }

  return false;
}

async function fillVisibleStageFields(page: Page, remark: string) {
  const remarkLocators = [
    page.locator("textarea").first(),
    page.locator('input[placeholder*="Remark" i]').first(),
    page.locator('textarea[placeholder*="Remark" i]').first(),
    page.locator('input[name*="remark" i]').first(),
  ];

  await fillFirstVisibleStageField(page, remarkLocators, remark);

  const followUpLocators = [
    page.locator('input[type="date"]').first(),
    page.locator('input[placeholder*="Follow" i]').first(),
    page.locator('input[name*="follow" i]').first(),
    page.locator('input[id*="follow" i]').first(),
  ];

  await fillFirstVisibleStageField(page, followUpLocators, tomorrowIsoDate());
  await selectCustomDateIfVisible(page, 1);

  const followUpTimeLocators = [
    page.locator('input[type="time"]').first(),
    page.locator('input[placeholder*="Time" i]').first(),
    page.locator('input[name*="time" i]').first(),
    page.locator('input[id*="time" i]').first(),
  ];

  await fillFirstVisibleStageField(page, followUpTimeLocators, "10:30");
  await selectCustomTimeIfVisible(page);
}

async function fillFirstVisibleStageField(page: Page, locators: Locator[], value: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (const locator of locators) {
      if (!(await locator.isVisible().catch(() => false))) {
        continue;
      }

      await revealLocator(page, locator);
      if (await fillWithFallback(locator, value)) {
        return true;
      }
    }

    const direction = attempt < 7 ? 1 : -1;
    const scrolled = await scrollStageFormSection(page, direction);
    if (!scrolled) {
      await page.mouse.wheel(0, direction * 500).catch(() => {});
    }
    await page.waitForTimeout(250);
  }

  return false;
}

async function selectOpportunityFollowUpDate(page: Page) {
  const startDateButtons = [
    page.getByRole("button", { name: /^start date$/i }).first(),
    page.getByRole("button", { name: /start date|select date|follow.*date/i }).first(),
    page.locator("button, [role='button']").filter({ hasText: /start date|select date/i }).first(),
  ];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    for (const startDateButton of startDateButtons) {
      await revealLocator(page, startDateButton);
      if (!(await startDateButton.isVisible().catch(() => false))) {
        continue;
      }

      await startDateButton.click({ force: true }).catch(() => {});
      for (let optionAttempt = 0; optionAttempt < 8; optionAttempt += 1) {
        const preferredDate = page.getByRole("option", { name: dateOptionName(3) }).first();
        const anyFutureDate = page
          .getByRole("option", { name: /Choose (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),/i })
          .first();

        for (const dateOption of [preferredDate, anyFutureDate]) {
          await revealLocator(page, dateOption);
          if (await dateOption.isVisible().catch(() => false)) {
            await dateOption.click({ force: true });
            return true;
          }
        }

        const scrolled = await scrollVisiblePopup(page);
        if (!scrolled) {
          break;
        }
        await page.waitForTimeout(250);
      }
    }

    const direction = attempt < 5 ? 1 : -1;
    const scrolled = await scrollStageFormSection(page, direction);
    if (!scrolled) {
      await page.mouse.wheel(0, direction * 500).catch(() => {});
    }
    await page.waitForTimeout(250);
  }

  return false;
}

async function selectCustomDateIfVisible(page: Page, daysAhead: number) {
  const dateButtonCandidates = [
    page.getByRole("button", { name: /select date|start date|follow.*date/i }).first(),
    page.getByText(/^Select Date\s*\*?$/i).locator("xpath=following::button[1]").first(),
    page.getByText(/^Next Follow Up\s*\*?$/i).locator("xpath=following::button[1]").first(),
    page.getByLabel(/next follow up|follow up|follow-up|select date|date/i).first(),
    page.locator("button, [role='button'], div").filter({ hasText: /select date|start date/i }).first(),
    page.locator('input[type="date"]').first(),
    page.locator('input[name*="follow" i]').first(),
    page.locator('input[aria-label*="follow" i]').first(),
  ];

  for (const dateButton of dateButtonCandidates) {
    if (!(await dateButton.isVisible().catch(() => false))) {
      continue;
    }

    await revealLocator(page, dateButton);
    await dateButton.click({ force: true }).catch(() => {});
    const dateOption = page.getByRole("option", { name: dateOptionName(daysAhead) }).first();
    if (await dateOption.isVisible().catch(() => false)) {
      await dateOption.click({ force: true });
      return true;
    }
  }

  if (await clickLabeledControl(page, /Select Date|Next Follow Up/i, 0)) {
    const dateOption = page.getByRole("option", { name: dateOptionName(daysAhead) }).first();
    if (await dateOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dateOption.click({ force: true });
      return true;
    }
  }

  return false;
}

async function selectCustomTimeIfVisible(page: Page) {
  const timeButtonCandidates = [
    page.getByRole("button", { name: /select time/i }).first(),
    page.getByText(/^Select Time\s*\*?$/i).locator("xpath=following::button[1]").first(),
    page.getByText(/^Next Follow Up\s*\*?$/i).locator("xpath=following::button[2]").first(),
    page.getByLabel(/next follow up|follow up|follow-up|select time|time/i).first(),
    page.locator("button, [role='button'], div").filter({ hasText: /^Select Time$/i }).first(),
    page.locator('input[type="time"]').first(),
    page.locator('input[name*="follow" i]').first(),
    page.locator('input[aria-label*="follow" i]').first(),
  ];

  for (const timeButton of timeButtonCandidates) {
    if (!(await timeButton.isVisible().catch(() => false))) {
      continue;
    }

    await revealLocator(page, timeButton);
    await timeButton.click({ force: true }).catch(() => {});
    const timeOption = page
      .locator("button, [role='option'], div, span")
      .filter({ hasText: /^(10|11):[0-5]\d\s?(AM|PM)$/i })
      .first();
    if (await timeOption.isVisible().catch(() => false)) {
      await timeOption.click({ force: true });
      return true;
    }
  }

  if (await clickLabeledControl(page, /Select Time|Next Follow Up/i, 1)) {
    const timeOption = page
      .locator("button, [role='option'], div, span")
      .filter({ hasText: /^(10|11):[0-5]\d\s?(AM|PM)$/i })
      .first();
    if (await timeOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await timeOption.click({ force: true });
      return true;
    }
  }

  return false;
}

async function clickLabeledControl(page: Page, labelPattern: RegExp, controlIndex: number) {
  return await page.evaluate(
    ({ source, flags, controlIndex }) => {
      const labelMatcher = new RegExp(source, flags);
      const normalize = (value: string | null | undefined) =>
        (value || "").replace(/\s+/g, " ").trim();
      const isVisible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          style.pointerEvents !== "none"
        );
      };

      const labels = Array.from(document.querySelectorAll<HTMLElement>("label, p, span, div"))
        .filter((element) => labelMatcher.test(normalize(element.innerText || element.textContent)) && isVisible(element))
        .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);

      for (const label of labels) {
        let container: HTMLElement | null = label.parentElement;
        for (let depth = 0; container && depth < 6; depth += 1) {
          const controls = Array.from(
            container.querySelectorAll<HTMLElement>("button, [role='button'], input, [tabindex], div[class*='cursor-pointer']")
          ).filter((element) => element !== label && isVisible(element));
          const control = controls[controlIndex] || controls[0];
          if (control) {
            control.scrollIntoView({ block: "center", inline: "center" });
            control.click();
            return true;
          }
          container = container.parentElement;
        }
      }

      return false;
    },
    { source: labelPattern.source, flags: labelPattern.flags, controlIndex },
  ).catch(() => false);
}

async function fillSiteVisitCancellationReason(
  page: Page,
  dropdownReason: string,
  inputReason: string,
) {
  const reasonDropdown = page
    .getByRole("button", { name: /select here/i })
    .first();
  if (await reasonDropdown.isVisible().catch(() => false)) {
    await clickWithFallback(
      page,
      reasonDropdown,
      async () =>
        await page
          .getByRole("button", {
            name: new RegExp(escapeRegex(dropdownReason), "i"),
          })
          .first()
          .isVisible()
          .catch(() => false),
    );

    const reasonOption = page
      .getByRole("button", {
        name: new RegExp(escapeRegex(dropdownReason), "i"),
      })
      .first();
    await expect(reasonOption).toBeVisible({ timeout: 30000 });
    await reasonOption.click({ force: true });
    return;
  }

  const reasonFields = [
    page.getByRole("textbox", { name: /reason|remarks/i }).first(),
    page.locator('textarea[placeholder*="reason" i]').first(),
    page.locator('input[placeholder*="reason" i]').first(),
    page.locator('textarea[placeholder*="remark" i]').first(),
    page.locator('input[placeholder*="remark" i]').first(),
    page.locator('textarea[name*="reason" i]').first(),
    page.locator('input[name*="reason" i]').first(),
    page.locator('textarea[name*="remark" i]').first(),
    page.locator('input[name*="remark" i]').first(),
    page.locator("#root-modal textarea").first(),
    page
      .locator('#root-modal input:not([type="date"]):not([type="time"])')
      .first(),
    page.locator("textarea").first(),
    page
      .locator(
        'input:not([type="date"]):not([type="time"]):not([type="search"])',
      )
      .last(),
    page.locator('[contenteditable="true"]').first(),
  ];

  const filled = await fillFirstVisibleField(page, reasonFields, inputReason);
  if (!filled) {
    throw new Error(
      "Cancellation reason dropdown or input field was not visible.",
    );
  }
}

async function clickVisibleSaveButton(page: Page, postSaveText?: RegExp) {
  const saveButtons = [
    page.locator("#root-modal").getByRole("button", { name: /^save$/i }),
    page.locator("#root-modal").getByRole("button", { name: /save|update|submit|apply|confirm|change stage|move/i }),
    page.getByRole("button", { name: /^save$/i }),
    page.getByRole("button", { name: /save|update|submit|apply|confirm|change stage|move/i }),
  ];

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (attempt > 0) {
      await scrollStageFormToBottom(page);
      await wheelRightStagePane(page);
    }

    for (const locator of saveButtons) {
      const count = await locator.count().catch(() => 0);
      for (let index = count - 1; index >= 0; index -= 1) {
        const button = locator.nth(index);
        if (!(await button.isVisible().catch(() => false))) {
          continue;
        }

        await revealLocator(page, button);
        await button.click({ force: true }).catch(() => {});
        if (postSaveText) {
          await expect(page.locator("body")).toContainText(postSaveText, {
            timeout: 15000,
          }).catch(() => {});
        }
        return true;
      }
    }

    if (await clickVisibleSaveButtonWithDom(page)) {
      if (postSaveText) {
        await expect(page.locator("body")).toContainText(postSaveText, {
          timeout: 15000,
        }).catch(() => {});
      }
      return true;
    }

    const scrolled = await scrollStageFormSection(page);
    if (!scrolled) {
      await wheelRightStagePane(page);
    }
  }

  return false;
}

async function scrollStageFormToBottom(page: Page) {
  await page.evaluate(() => {
    const normalize = (value: string | null | undefined) =>
      (value || "").replace(/\s+/g, " ").trim();

    const candidates = Array.from(document.querySelectorAll<HTMLElement>("main, section, article, div"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const text = normalize(element.innerText || element.textContent);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          element.scrollHeight > element.clientHeight &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          (rect.left > window.innerWidth * 0.25 || /Choose a stage|Remarks|Add Follow up|Next Follow Up/i.test(text))
        );
      })
      .sort((left, right) => {
        const leftText = normalize(left.innerText || left.textContent);
        const rightText = normalize(right.innerText || right.textContent);
        const leftPriority = /Choose a stage|Remarks|Add Follow up|Next Follow Up/i.test(leftText) ? 0 : 1;
        const rightPriority = /Choose a stage|Remarks|Add Follow up|Next Follow Up/i.test(rightText) ? 0 : 1;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        return right.getBoundingClientRect().left - left.getBoundingClientRect().left;
      });

    for (const element of candidates) {
      element.scrollTop = element.scrollHeight;
    }

    document.scrollingElement?.scrollTo({ top: document.scrollingElement.scrollHeight });
  }).catch(() => {});
  await page.waitForTimeout(250);
}

async function wheelRightStagePane(page: Page, deltaY = 900) {
  const viewport = page.viewportSize();
  if (viewport) {
    await page.mouse.move(Math.max(0, viewport.width - 360), Math.max(0, viewport.height - 260)).catch(() => {});
  }
  await page.mouse.wheel(0, deltaY).catch(() => {});
  await page.waitForTimeout(250);
}

async function clickVisibleSaveButtonWithDom(page: Page) {
  return await page.evaluate(() => {
    const normalize = (value: string | null | undefined) =>
      (value || "").replace(/\s+/g, " ").trim();
    const isVisible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.pointerEvents !== "none"
      );
    };

    const matches = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
      .filter((element) => /^(Save|Update|Submit|Apply|Confirm|Save Changes|Change Stage|Move to Opportunity)$/i.test(normalize(element.innerText || element.textContent)) && isVisible(element))
      .sort((left, right) => right.getBoundingClientRect().left - left.getBoundingClientRect().left);

    const button = matches[0];
    if (!button) {
      return false;
    }

    button.scrollIntoView({ block: "center", inline: "center" });
    button.click();
    return true;
  }).catch(() => false);
}

async function revealLocator(page: Page, locator: Locator) {
  const handle = await locator.elementHandle().catch(() => null);
  if (!handle) {
    return false;
  }

  await handle
    .evaluate((element) => {
      const target = element as HTMLElement;
      const scrollableParents: HTMLElement[] = [];
      let parent = target.parentElement;

      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        const canScrollY =
          parent.scrollHeight > parent.clientHeight &&
          /(auto|scroll|overlay)/.test(style.overflowY);
        const canScrollX =
          parent.scrollWidth > parent.clientWidth &&
          /(auto|scroll|overlay)/.test(style.overflowX);

        if (canScrollY || canScrollX) {
          scrollableParents.push(parent);
        }

        parent = parent.parentElement;
      }

      for (const container of scrollableParents.reverse()) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();

        container.scrollTop +=
          targetRect.top -
          containerRect.top -
          Math.max(24, Math.floor((container.clientHeight - targetRect.height) / 2));
        container.scrollLeft +=
          targetRect.left -
          containerRect.left -
          Math.max(0, Math.floor((container.clientWidth - targetRect.width) / 2));
      }

      target.scrollIntoView({ block: "center", inline: "nearest" });
    })
    .catch(() => {});
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(100);
  return true;
}

async function resetStageFormScroll(page: Page) {
  await page.evaluate(() => {
    const normalize = (value: string | null | undefined) =>
      (value || "").replace(/\s+/g, " ").trim();
    const candidates = Array.from(document.querySelectorAll<HTMLElement>("main, section, article, div"))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const text = normalize(element.innerText || element.textContent);
        return (
          element.scrollHeight > element.clientHeight &&
          /(auto|scroll|overlay)/.test(style.overflowY) &&
          /Choose a stage|Choose a sub stage|Remarks|Add Follow up/i.test(text)
        );
      });

    for (const element of candidates) {
      element.scrollTop = 0;
    }

    document.scrollingElement?.scrollTo({ top: 0 });
  }).catch(() => {});
  await page.waitForTimeout(150);
}

async function visibleChangeStageText(page: Page) {
  return await page.evaluate(() => {
    const normalize = (value: string | null | undefined) =>
      (value || "").replace(/\s+/g, " ").trim();
    const candidates = Array.from(document.querySelectorAll<HTMLElement>("section, article, div"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const text = normalize(element.innerText || element.textContent);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          /Choose a stage|Choose a sub stage|Remarks|Add Follow up/i.test(text)
        );
      })
      .sort((left, right) => normalize(left.innerText).length - normalize(right.innerText).length);

    return normalize(candidates[0]?.innerText || candidates[0]?.textContent).slice(0, 500);
  }).catch(() => "");
}

async function scrollStageFormSection(page: Page, direction = 1) {
  return await page.evaluate((scrollDirection) => {
    const normalize = (value: string | null | undefined) =>
      (value || "").replace(/\s+/g, " ").trim();

    const scrollables = Array.from(
      document.querySelectorAll<HTMLElement>("div, section, main"),
    )
      .map((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const text = normalize(element.innerText || element.textContent);
        const canScroll =
          rect.width > 0 &&
          rect.height > 0 &&
          element.scrollHeight > element.clientHeight &&
          /(auto|scroll|overlay)/.test(style.overflowY);

        if (!canScroll) {
          return null;
        }

        let priority = 99;
        if (/Choose a stage|Choose a sub stage/i.test(text)) {
          priority = 0;
        } else if (/Remarks|Add Follow up|Select Date|Select Time/i.test(text)) {
          priority = 1;
        } else if (/End Visit|Send OTP|Visit In Progress|No Show|Cancelled/i.test(text)) {
          priority = 2;
        } else if (/Site Visit/i.test(text)) {
          priority = 8;
        }

        if (priority === 99) {
          return null;
        }

        return { element, priority, textLength: text.length, left: rect.left };
      })
      .filter((candidate): candidate is { element: HTMLElement; priority: number; textLength: number; left: number } => Boolean(candidate))
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }

        // The Change Stage form is the right-side pane; prefer it over the left lead details pane.
        if (Math.abs(left.left - right.left) > 20) {
          return right.left - left.left;
        }

        return left.textLength - right.textLength;
      });

    for (const { element } of scrollables) {
      const previousTop = element.scrollTop;
      const distance = Math.max(Math.floor(element.clientHeight * 0.85), 320) * scrollDirection;
      element.scrollTop = Math.max(
        0,
        Math.min(element.scrollTop + distance, element.scrollHeight - element.clientHeight),
      );
      if (element.scrollTop !== previousTop) {
        return true;
      }
    }

    return false;
  }, direction);
}

async function isTabActive(tab: Locator) {
  const className = (await tab.getAttribute("class").catch(() => "")) ?? "";
  const ariaSelected =
    (await tab.getAttribute("aria-selected").catch(() => "")) ?? "";
  const dataState =
    (await tab.getAttribute("data-state").catch(() => "")) ?? "";

  return (
    /selected|active|bg-|text-white|shadow/i.test(className) ||
    ariaSelected === "true" ||
    dataState === "active"
  );
}

async function stagePanelIsOpen(
  page: Page,
  tabStrip: Locator,
  changeStageTab: Locator,
  aiInsightsTab: Locator,
) {
  const chooseStage = page.getByText("Choose a stage", { exact: true }).first();
  if (await chooseStage.isVisible().catch(() => false)) {
    return true;
  }

  const chooseSubStage = page.getByText(/Choose a sub stage/i).first();
  if (await chooseSubStage.isVisible().catch(() => false)) {
    return true;
  }

  const panelText = await tabStrip
    .locator("xpath=following::div[1]")
    .innerText()
    .catch(() => "");

  if (/Choose a stage/i.test(panelText)) {
    return true;
  }

  if (/Choose a sub stage/i.test(panelText)) {
    return true;
  }

  const statusLabel = page.getByText(/^Status$/i).first();
  const stageChips = page
    .locator("button, [role='button'], div, span")
    .filter({ hasText: /^(New Lead|Contacted|Prospect|Open|Qualified|Site Visit|Negotiation|Opportunity|Dropped|Booked)$/i });
  if (await statusLabel.isVisible().catch(() => false)) {
    const stageChipCount = Math.min(await stageChips.count().catch(() => 0), 30);
    for (let index = 0; index < stageChipCount; index += 1) {
      if (await stageChips.nth(index).isVisible().catch(() => false)) {
        return true;
      }
    }
  }

  if (/^Status\b/i.test(panelText) && /New Lead|Contacted|Prospect|Open|Qualified|Site Visit|Negotiation|Opportunity|Dropped/i.test(panelText)) {
    return true;
  }

  const changeStageActive = await isTabActive(changeStageTab);
  const aiInsightsActive = await isTabActive(aiInsightsTab);

  if (changeStageActive && !aiInsightsActive) {
    return /Choose a stage|Choose a sub stage/i.test(panelText);
  }

  return false;
}

async function openChangeStageTab(page: Page) {
  const tabStrip = page
    .locator("div")
    .filter({ has: page.getByText("Overview", { exact: true }) })
    .filter({ has: page.getByText("AI Insights", { exact: true }) })
    .filter({ has: page.getByText("Lead Journey", { exact: true }) })
    .filter({ has: page.getByText("Change Stage", { exact: true }) })
    .first();

  const changeStageTab = tabStrip.getByText("Change Stage", { exact: true });
  const aiInsightsTab = tabStrip.getByText("AI Insights", { exact: true });
  await expect(changeStageTab).toBeVisible({ timeout: 60000 });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await changeStageTab.scrollIntoViewIfNeeded().catch(() => {});
    await clickWithFallback(
      page,
      changeStageTab,
      async () =>
        await stagePanelIsOpen(page, tabStrip, changeStageTab, aiInsightsTab),
      { force: true },
    );
    const opened = await stagePanelIsOpen(
      page,
      tabStrip,
      changeStageTab,
      aiInsightsTab,
    );

    if (opened) {
      return;
    }

    await clickWithFallback(
      page,
      changeStageTab,
      async () =>
        await stagePanelIsOpen(page, tabStrip, changeStageTab, aiInsightsTab),
      { force: true, position: { x: 18, y: 18 } },
    ).catch(() => {});
    const reopened = await stagePanelIsOpen(
      page,
      tabStrip,
      changeStageTab,
      aiInsightsTab,
    );

    if (reopened) {
      return;
    }
  }

  throw new Error('Change Stage tab did not open the "Choose a stage" view.');
}

export async function moveLeadThroughStages(
  page: Page,
  transitions: StageTransition[],
) {
  await openChangeStageTab(page);

  for (const transition of transitions) {
    const stageChip = page
      .getByText(new RegExp(`^${transition.stage}$`, "i"))
      .last();
    await expect(stageChip).toBeVisible({ timeout: 30000 });
    await stageChip.click({ force: true });

    if (/^site visit$/i.test(transition.stage)) {
      await fillSiteVisitBookingFields(page);
    }

    await fillVisibleStageFields(page, transition.remark);

    const saved = await clickVisibleSaveButton(page);
    if (!saved) {
      throw new Error(
        `Save button was not visible after selecting stage "${transition.stage}".`,
      );
    }

    await expect
      .poll(
        async () => {
          const bodyText = await page.locator("body").innerText();
          return new RegExp(transition.stage, "i").test(bodyText);
        },
        { timeout: 60000 },
      )
      .toBeTruthy();

    await openChangeStageTab(page);
  }
}

export async function openLeadTaskFromDashboard(
  page: Page,
  app: AppConfig,
  leadName: string,
) {
  await page.goto("/admin/developer/cpms/manage-construction", {
    waitUntil: "networkidle",
  });
  await ensureActiveProject(page, app.activeProjectName);
  await waitForManageConstructionContent(page);

  const engagementModuleButton = page
    .locator("button")
    .filter({
      has: page.locator('img[alt*="engagement" i], img[alt*="Engagement" i]'),
    })
    .first();

  await expect(engagementModuleButton).toBeVisible({ timeout: 60000 });
  await clickWithFallback(
    page,
    engagementModuleButton,
    async () =>
      await page
        .getByText(/Lead Dashboard/i)
        .first()
        .isVisible()
        .catch(() => false),
  );

  const leadDashboardTab = page.getByText(/^Lead Dashboard$/i).first();
  await expect(leadDashboardTab).toBeVisible({ timeout: 60000 });
  await clickWithFallback(
    page,
    leadDashboardTab,
    async () =>
      await page
        .getByText(/AI-Prioritized Executive Tasks/i)
        .first()
        .isVisible()
        .catch(() => false),
    { force: true },
  );

  const executiveTaskSection = page
    .locator("div, section, article")
    .filter({ hasText: /AI-Prioritized Executive Tasks/i })
    .first();

  await expect(executiveTaskSection).toBeVisible({ timeout: 60000 });
  const viewAllButton = executiveTaskSection
    .getByRole("button", { name: /view all/i })
    .first();
  await expect(viewAllButton).toBeVisible({ timeout: 60000 });
  await clickWithFallback(
    page,
    viewAllButton,
    async () =>
      await page
        .locator('input, [role="textbox"]')
        .first()
        .isVisible()
        .catch(() => false),
  );

  const searchInputCandidates = [
    page.locator("#search").first(),
    page.getByRole("textbox", { name: /search/i }).first(),
    page.locator('input[placeholder*="search" i]').first(),
    page.locator('input[type="search"]').first(),
    page.locator("input").first(),
  ];

  let searched = false;
  for (const searchInput of searchInputCandidates) {
    if (!(await searchInput.isVisible().catch(() => false))) {
      continue;
    }

    await searchInput.click().catch(() => {});
    await searchInput.fill(leadName);
    await searchInput.press("Enter").catch(() => {});
    searched = true;
    break;
  }

  if (!searched) {
    throw new Error(
      "Task card search input was not visible after opening AI-prioritized tasks.",
    );
  }

  const exactLeadName = page.getByText(new RegExp(escapeRegex(leadName), "i")).first();
  const searchedSiteVisitTableRow = page
    .locator("tbody tr")
    .filter({ hasText: /Site Visit/i })
    .filter({ hasText: /Pending|Overdue|Completed|Aakarsh/i })
    .first();
  const searchedSiteVisitCard = page
    .locator("div, article, section")
    .filter({ hasText: /Site Visit/i })
    .filter({ hasText: /Pending|Overdue|Completed|Aakarsh/i })
    .last();

  await expect
    .poll(
      async () =>
        (await exactLeadName.isVisible().catch(() => false)) ||
        (await searchedSiteVisitTableRow.isVisible().catch(() => false)) ||
        (await searchedSiteVisitCard.isVisible().catch(() => false)),
      { timeout: 60000 },
    )
    .toBeTruthy();

  const leadTaskCard = (await searchedSiteVisitTableRow.isVisible().catch(() => false))
    ? searchedSiteVisitTableRow
    : (await exactLeadName.isVisible().catch(() => false))
      ? page
          .locator("div, article, section")
          .filter({ hasText: new RegExp(escapeRegex(leadName), "i") })
          .filter({ hasText: /Site Visit/i })
          .last()
      : searchedSiteVisitCard;

  await expect(leadTaskCard).toBeVisible({ timeout: 60000 });

  const takeActionButton = leadTaskCard
    .getByRole("button", { name: /take action/i })
    .first();
  await leadTaskCard.click({ force: true }).catch(() => {});
  let navigatedFromCard = await page
    .waitForURL(/engagement-intelligence\/manage-leads\/?\?id=/, {
      timeout: 10000,
    })
    .then(() => true)
    .catch(() => false);

  if (
    !navigatedFromCard &&
    (await takeActionButton.isVisible().catch(() => false))
  ) {
    await clickWithFallback(page, takeActionButton, async () =>
      /engagement-intelligence\/manage-leads\/?\?id=/.test(page.url()),
    );
    navigatedFromCard = /engagement-intelligence\/manage-leads\/?\?id=/.test(page.url());
  }

  if (!navigatedFromCard) {
    await goToManageLeads(page, app);
    await openLeadByName(page, leadName);
  }

  await waitForLeadProfile(page);
}

export async function cancelSiteVisitFromOpenedLead(
  page: Page,
  remark = "automation is done",
  reason = "Out of Town",
  leadName?: string,
) {
  if (leadName) {
    await ensureLeadProfileIsOpen(page, leadName);
  }
  await openChangeStageTab(page);

  const cancelledOption = page.getByText(/^Cancelled$/i).last();
  await expect(cancelledOption).toBeVisible({ timeout: 30000 });
  await clickWithFallback(
    page,
    cancelledOption,
    async () => {
      const dropdownVisible = await page
        .getByRole("button", { name: /select here/i })
        .first()
        .isVisible()
        .catch(() => false);
      const reasonInputVisible = await page
        .getByRole("textbox", { name: /reason|remarks/i })
        .first()
        .isVisible()
        .catch(() => false);
      const modalInputVisible = await page
        .locator("#root-modal input, #root-modal textarea")
        .first()
        .isVisible()
        .catch(() => false);
      return dropdownVisible || reasonInputVisible || modalInputVisible;
    },
    { force: true },
  );

  await fillSiteVisitCancellationReason(page, reason, remark);

  const remarksField = page.getByRole("textbox", { name: /remarks/i }).first();
  if (await remarksField.isVisible().catch(() => false)) {
    await remarksField.fill(remark);
  }

  const nextFollowUpDateVisible = await page
    .locator('input[type="date"], input[name*="date" i], input[placeholder*="date" i], input[name*="follow" i], input[placeholder*="follow" i], input[aria-label*="follow" i]')
    .first()
    .isVisible()
    .catch(() => false);

  const dateSelected = nextFollowUpDateVisible
    ? (await selectCustomDateIfVisible(page, 3)) ||
      (await fillFirstVisibleField(
        page,
        [
          page.getByLabel(/next follow up|follow up|follow-up|date/i).first(),
          page.locator('input[type="date"]').first(),
          page.locator('input[placeholder*="date" i]').first(),
          page.locator('input[name*="date" i]').first(),
          page.locator('input[name*="follow" i]').first(),
          page.locator('input[aria-label*="follow" i]').first(),
          page.locator('input[placeholder*="follow" i]').first(),
        ],
        siteVisitIsoDate(),
      ))
    : true;

  if (nextFollowUpDateVisible && !dateSelected) {
    throw new Error('Next Follow Up date was not selectable after choosing "Cancelled".');
  }

  const nextFollowUpTimeVisible = await page
    .locator('input[type="time"], input[name*="time" i], input[placeholder*="time" i], input[name*="follow" i], input[placeholder*="follow" i], input[aria-label*="follow" i]')
    .first()
    .isVisible()
    .catch(() => false);

  const timeSelected = nextFollowUpTimeVisible
    ? (await selectCustomTimeIfVisible(page)) ||
      (await fillFirstVisibleField(
        page,
        [
          page.getByLabel(/next follow up|follow up|follow-up|time/i).first(),
          page.locator('input[type="time"]').first(),
          page.locator('input[placeholder*="time" i]').first(),
          page.locator('input[name*="time" i]').first(),
          page.locator('input[name*="follow" i]').first(),
          page.locator('input[aria-label*="follow" i]').first(),
          page.locator('input[placeholder*="follow" i]').first(),
        ],
        "14:00",
      ))
    : true;

  if (nextFollowUpTimeVisible && !timeSelected) {
    throw new Error('Next Follow Up time was not selectable after choosing "Cancelled".');
  }

  const saved = await clickVisibleSaveButton(page);
  if (!saved) {
    const stageUpdated = await expect
      .poll(
        async () => {
          const bodyText = await page.locator("body").innerText();
          return /Stage Updated to Cancelled|Dropped Reason\s*:\s*\S|Cancelled|Cancelled Stage|Site Visit Cancelled/i.test(
            bodyText,
          );
        },
        { timeout: 30000 },
      )
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (!stageUpdated) {
      throw new Error(
        'Save button was not visible after selecting "Cancelled" site visit condition.',
      );
    }
  }

  await expect
    .poll(
      async () => {
        const bodyText = await page.locator("body").innerText();
        return /Stage Updated to Cancelled|Dropped Reason\s*:\s*\S|Cancelled|Cancelled Stage|Site Visit Cancelled/i.test(
          bodyText,
        );
      },
      { timeout: 60000 },
    )
    .toBeTruthy();

  if (leadName) {
    await ensureLeadProfileIsOpen(page, leadName);
  }
}

export async function assertLeadJourneyStages(page: Page, stages: string[]) {
  await new LeadProfilePage(page).expectJourneyStages(stages);
}
