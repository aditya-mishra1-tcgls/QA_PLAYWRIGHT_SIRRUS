import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { ChannelPartnerPage } from "../pages";

type AppConfig = {
  activeProjectName: string;
  envName?: string;
};

type ChannelPartnerSeed = {
  companyName: string;
  entityType: string;
  fullName: string;
  email: string;
  whatsAppNumber: string;
  specialCharDropdownOption: string;
};

const FALLBACK_RENDER_WAIT_MS = 5000;

function randomAlphaNumeric(length: number) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

function randomLetters(length: number) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

function randomMobileNumber() {
  const firstDigit = String(Math.floor(Math.random() * 4) + 6);
  const rest = Array.from({ length: 9 }, () => String(Math.floor(Math.random() * 10))).join("");
  return `${firstDigit}${rest}`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
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

async function clickFirstVisible(locators: Locator[]) {
  for (const locator of locators) {
    const candidate = locator.first();
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.scrollIntoViewIfNeeded().catch(() => {});
      await candidate.click({ force: true });
      return true;
    }
  }

  return false;
}

async function clickRequiredFirstVisible(locators: Locator[], label: string) {
  const clicked = await clickFirstVisible(locators);
  if (!clicked) {
    throw new Error(`Unable to find visible ${label}.`);
  }
}

async function fillFirstVisible(candidates: Locator[], value: string, label: string) {
  for (const candidate of candidates) {
    if (await candidate.first().isVisible().catch(() => false)) {
      await candidate.first().fill(value);
      return;
    }
  }

  throw new Error(`Unable to find visible ${label} field on the Channel Partner form.`);
}

async function fillInputNearLabel(page: Page, labelText: string, value: string) {
  const targetAttribute = `pw-fill-${Date.now()}-${randomAlphaNumeric(4)}`;
  const found = await page.evaluate(
    ({ labelText: expectedLabelText, targetAttribute: attribute }) => {
      const normalize = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
      const isVisible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const labels = Array.from(document.querySelectorAll("body *")).filter((element) => {
        return isVisible(element) && normalize(element.textContent) === expectedLabelText;
      });

      for (const label of labels) {
        let container: Element | null = label;
        for (let depth = 0; depth < 6 && container; depth += 1) {
          const input = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
            'input:not([type="hidden"]), textarea',
          )).find(isVisible);

          if (input) {
            input.setAttribute("data-playwright-fill-target", attribute);
            return true;
          }

          container = container.parentElement;
        }
      }

      return false;
    },
    { labelText, targetAttribute },
  );

  if (!found) {
    throw new Error(`Unable to find visible ${labelText} field on the Channel Partner form.`);
  }

  const input = page.locator(`[data-playwright-fill-target="${targetAttribute}"]`);
  await input.click({ force: true });
  await input.pressSequentially(value, { delay: 10 });
  await expect(input).toHaveValue(value);
}

function tabName(label: string) {
  if (label === "All CP") {
    return /^All CP'?s?(?:\s+\d+)?$/i;
  }

  return new RegExp(`^${label}(?:\\s+\\d+)?$`, "i");
}

async function waitForLoadingToFinish(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect
    .poll(async () => {
      const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
      return !/\bloading\b|fetching|please wait/i.test(bodyText);
    }, { timeout: 15000 })
    .toBeTruthy()
    .catch(() => {});
}

async function waitForChannelPartnerListing(page: Page) {
  await waitForLoadingToFinish(page);

  await expect
    .poll(async () => {
      const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
      const allTabVisible = await page.getByRole("tab", { name: tabName("All CP") }).isVisible().catch(() => false);
      const unregisteredTabVisible = await page.getByRole("tab", { name: tabName("Unregistered") }).isVisible().catch(() => false);
      const registeredTabVisible = await page.getByRole("tab", { name: tabName("Registered") }).isVisible().catch(() => false);

      return (
        /channel partner|all cp|unregistered|registered/i.test(bodyText) &&
        allTabVisible &&
        unregisteredTabVisible &&
        registeredTabVisible
      );
    }, { timeout: 60000 })
    .toBeTruthy();
}

export async function goToChannelPartnerListing(page: Page, app: AppConfig) {
  await base.step("Open Channel Partner listing", async () => {
    await new ChannelPartnerPage(page).open(app);
  });
}

export function buildChannelPartnerSeed(app: AppConfig): ChannelPartnerSeed {
  const suffix = randomAlphaNumeric(6);
  const contactSuffix = randomLetters(6);
  const emailDomain = process.env.AUTOMATION_CP_EMAIL_DOMAIN || "test.com";

  return {
    companyName: `Automation CP ${suffix}`,
    entityType: process.env.AUTOMATION_CP_ENTITY_TYPE || "One Person Company (OPC)",
    fullName: `Automation Head ${contactSuffix}`,
    email: `automation.cp+${app.envName || "local"}-${suffix.toLowerCase()}@${emailDomain}`,
    whatsAppNumber: randomMobileNumber(),
    specialCharDropdownOption: process.env.AUTOMATION_CP_SPECIAL_CHAR_DROPDOWN || "!@#$%^&*",
  };
}

async function selectDropdownOption(page: Page, trigger: Locator, optionName: string, label: string) {
  const escapedOption = escapeRegex(optionName);
  const optionCandidates = [
    page.getByRole("option", { name: new RegExp(`^${escapedOption}$`, "i") }).first(),
    page.getByRole("button", { name: new RegExp(`^${escapedOption}$`, "i") }).first(),
    page.getByText(new RegExp(escapedOption, "i")).last(),
    page.locator("[role='option'], button, li, div").filter({ hasText: new RegExp(escapedOption, "i") }).first(),
  ];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await trigger.click({ force: true });

    const selected = await expect
      .poll(async () => {
        for (const candidate of optionCandidates) {
          if (await candidate.isVisible().catch(() => false)) {
            await candidate.scrollIntoViewIfNeeded().catch(() => {});
            await candidate.click({ force: true });
            return true;
          }
        }

        return false;
      }, { timeout: 10000 })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);

    if (selected) {
      return;
    }
  }

  throw new Error(`Unable to find visible ${label} option "${optionName}".`);
}

function dropdownAfterLabel(page: Page, label: RegExp) {
  return page
    .getByText(label)
    .last()
    .locator("xpath=following::button[contains(normalize-space(), 'Select here')][1]");
}

async function selectChannelPartnerEntityType(page: Page, entityType: string) {
  await base.step("Select CP entity type", async () => {
    const entityTriggerCandidates = [
      page.getByLabel(/entity|company type|constitution|organization type|business type/i).first(),
      page.getByRole("button", { name: /select here/i }).first(),
      page.locator("button").filter({ hasText: /select here/i }).first(),
    ];

    for (const trigger of entityTriggerCandidates) {
      if (await trigger.isVisible().catch(() => false)) {
        await selectDropdownOption(page, trigger, entityType, "CP entity type");
        return;
      }
    }

    throw new Error("Unable to find CP entity type dropdown.");
  });
}

async function selectRequiredSpecialCharDropdown(page: Page, optionName: string) {
  await base.step("Select required CP special-character dropdown", async () => {
    const trigger = dropdownAfterLabel(page, /dropdown special char/i);
    if (await trigger.isVisible().catch(() => false)) {
      await selectDropdownOption(page, trigger, optionName, "CP special-character dropdown");
      return;
    }

    throw new Error("Unable to find required CP special-character dropdown.");
  });
}

export async function createChannelPartner(
  page: Page,
  app: AppConfig,
  seed = buildChannelPartnerSeed(app),
) {
  await goToChannelPartnerListing(page, app);

  await base.step("Open Add Channel Partner form", async () => {
    await clickRequiredFirstVisible(
      [
        page.getByRole("button", { name: /add channel partner/i }).first(),
        page.getByRole("link", { name: /add channel partner/i }).first(),
        page.locator("button,a").filter({ hasText: /add channel partner/i }).first(),
      ],
      "Add Channel Partner button",
    );

    await expect
      .poll(async () => {
        const formFieldCandidates = [
          page.locator("#companyName"),
          page.getByLabel(/company name|firm name|cp name/i).first(),
          page.locator('input[name="companyName"], input[placeholder*="company" i]').first(),
        ];

        for (const candidate of formFieldCandidates) {
          if (await candidate.isVisible().catch(() => false)) {
            return true;
          }
        }

        return false;
      }, { timeout: 30000 })
      .toBeTruthy();
  });

  await base.step("Fill CP company and primary contact details", async () => {
    await fillFirstVisible(
      [
        page.locator("#companyName"),
        page.getByLabel(/company name|firm name|cp name/i).first(),
        page.locator('input[name="companyName"], input[placeholder*="company" i]').first(),
      ],
      seed.companyName,
      "company name",
    );

    await selectChannelPartnerEntityType(page, seed.entityType);

    await fillInputNearLabel(page, "Contact Person Name", seed.fullName);

    await fillFirstVisible(
      [
        page.locator("#email"),
        page.getByLabel(/email/i).first(),
        page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first(),
      ],
      seed.email,
      "email",
    );

    await fillFirstVisible(
      [
        page.locator("#whatsAppNumber"),
        page.getByLabel(/whats\s*app|mobile|phone/i).first(),
        page.locator('input[name="whatsAppNumber"], input[placeholder*="whats" i], input[placeholder*="mobile" i]').first(),
      ],
      seed.whatsAppNumber,
      "WhatsApp number",
    );

    await selectRequiredSpecialCharDropdown(page, seed.specialCharDropdownOption);
  });

  await base.step("Submit CP creation", async () => {
    await clickRequiredFirstVisible(
      [
        page.getByRole("button", { name: /^save$/i }).first(),
        page.getByRole("button", { name: /save|create|submit|add channel partner/i }).first(),
        page.locator('button[type="submit"]').first(),
      ],
      "save Channel Partner button",
    );

    await expect
      .poll(async () => {
        const successVisible = await page
          .getByText(/channel partner added|channel partner created|success/i)
          .isVisible()
          .catch(() => false);
        const formClosed = !(await page.locator("#companyName").isVisible().catch(() => false));

        return successVisible || formClosed;
      }, { timeout: 60000 })
      .toBeTruthy();
  });

  return seed;
}

export async function assertChannelPartnerCreated(page: Page, seed: ChannelPartnerSeed) {
  await base.step("Search and verify created CP", async () => {
    await waitForChannelPartnerListing(page);

    const allTab = page.getByRole("tab", { name: tabName("All CP") });
    if (await allTab.isVisible().catch(() => false)) {
      await allTab.click({ force: true }).catch(() => {});
      await waitForLoadingToFinish(page);
    }

    const searchInputCandidates = [
      page.locator("#search").first(),
      page.getByRole("searchbox").first(),
      page.getByRole("textbox", { name: /search/i }).first(),
      page.locator('input[type="search"]').first(),
      page.locator('input[placeholder*="search" i]').first(),
    ];

    let searched = false;
    for (const searchInput of searchInputCandidates) {
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.click().catch(() => {});
        await searchInput.fill(seed.fullName);
        await searchInput.press("Enter").catch(() => {});
        searched = true;
        break;
      }
    }

    if (!searched) {
      throw new Error("CP listing search input was not visible.");
    }

    await waitForLoadingToFinish(page);

    await expect
      .poll(async () => {
        const noResultsVisible = await page.getByText(/no results found|we did not find any results/i).isVisible().catch(() => false);
        if (noResultsVisible) {
          return 0;
        }

        return await page
          .locator('a[href*="/channel-partners/channel-partner-qualification"]')
          .count()
          .catch(() => 0);
      }, { timeout: 60000 })
      .toBeGreaterThan(0);
  });
}

export async function selectChannelPartnerTab(page: Page, label: "Unregistered" | "Registered") {
  await base.step(`Open ${label} CP tab`, async () => {
    await new ChannelPartnerPage(page).selectTab(label);
  });
}

export async function expectChannelPartnerListVisible(page: Page) {
  await base.step("Verify CP list is visible", async () => {
    await new ChannelPartnerPage(page).expectListVisible();
  });
}

export async function expectChannelPartnerListFilteredByStage(
  page: Page,
  stage: "Unregistered" | "Registered",
) {
  await base.step(`Verify ${stage} CP list is visible`, async () => {
    await new ChannelPartnerPage(page).expectListFilteredByStage(stage);
  });
}
