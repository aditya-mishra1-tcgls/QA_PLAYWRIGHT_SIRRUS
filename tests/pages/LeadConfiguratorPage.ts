import { expect, type Locator, type Page } from "@playwright/test";
import { ensureAuthenticatedSession } from "../support/session";
import { clickFirstVisible, escapeRegex, normalizeText } from "../support/ui-actions";
import { LeadListPage } from "./LeadListPage";
import { ProjectSwitcherPage } from "./ProjectSwitcherPage";

type ConfigApp = {
  baseUrl?: string;
  activeProjectName: string;
  mobileNumber?: string;
  otp?: string;
};

type ConfigurableField = {
  label: string;
  checked: boolean;
};

type ToggleTarget = ConfigurableField & {
  card: Locator;
};

const NON_FIELD_TEXT = /^(save|cancel|clear|reset|apply|settings|customi[sz]e|lead form|lead details|config\.?|mandatory|optional|required|system|custom|field|fields|drag|drop|type|select here|form fields(?: add field)?|form preview|lead info|preferences|additional details)$/i;

function normalizeFieldLabel(value: string) {
  return normalizeText(value)
    .replace(/\s*\*$/, "")
    .replace(/\s*:\s*-$/, "")
    .replace(/\s*:\s*$/, "")
    .trim();
}

function uniqueLabels(labels: string[]) {
  const seen = new Set<string>();
  return labels.filter((label) => {
    const normalized = normalizeFieldLabel(label);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export class LeadConfiguratorPage {
  constructor(private readonly page: Page) {}

  get settingsModuleButton() {
    return this.page.getByRole("button", { name: /^settings$/i }).first();
  }

  get engagementModuleButton() {
    return this.page
      .locator("button")
      .filter({ has: this.page.locator('img[alt*="engagement" i], img[alt*="Engagement" i]') })
      .first();
  }

  async openLeadFormConfigurator(app: ConfigApp) {
    await this.openSettings(app);
    await this.clickSettingsLink(/Customi[sz]e Lead Form/i, "customise lead form");
    await this.waitForConfiguratorReady();
  }

  async openLeadOverviewConfigurator(app: ConfigApp) {
    await this.openSettings(app);
    await this.clickSettingsLink(/Customi[sz]e Lead Overview/i, "customise lead overview");
    await this.page.getByRole("button", { name: /Lead Details\s*\|\s*Config/i }).click({ timeout: 30000 }).catch(() => {});
    await this.waitForConfiguratorReady();
  }

  async openLeadListing(app: ConfigApp) {
    await new LeadListPage(this.page).openManageLeads(app);
    await this.page.getByRole("tab", { name: /Lead Listing/i }).click({ timeout: 30000 });
    await this.waitForLeadListingReady();
  }

  async openAddLeadFormFromListing(app: ConfigApp) {
    await this.openLeadListing(app);
    await this.page.getByRole("button", { name: /^Add Lead$/i }).click({ timeout: 30000 });

    const nestedAddLead = this.page.getByRole("menuitem", { name: /^Add Lead$/i }).first();
    if (await nestedAddLead.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nestedAddLead.click();
    }

    await expect(this.page.getByText("Lead Form", { exact: true })).toBeVisible({ timeout: 30000 });
  }

  async openFirstLeadDetailsFromListing(app: ConfigApp) {
    await this.openLeadListing(app);
    await this.openFirstLeadDetailsFromCurrentState();
  }

  async openFirstLeadDetailsFromCurrentState() {
    const leadLink = this.page.locator('a[href*="engagement-intelligence/manage-leads"][href*="id="]').first();
    await expect(leadLink).toBeVisible({ timeout: 60000 });
    await leadLink.click();
    await expect
      .poll(async () => /id=/.test(this.page.url()) || /Lead Profile|Change Stage|Lead Journey/i.test(await this.bodyText()), {
        timeout: 60000,
      })
      .toBeTruthy();
  }

  async readLeadFormFieldLabels() {
    const labels = await this.page.locator("#root-modal h3").evaluateAll((nodes) =>
      nodes
        .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean),
    );

    return uniqueLabels(
      labels
        .map(normalizeFieldLabel)
        .filter((label) => !NON_FIELD_TEXT.test(label) && label.length <= 80),
    );
  }

  async readVisibleConfiguratorFieldLabels() {
    return uniqueLabels(await this.readConfiguratorFieldLabelsFromText());
  }

  async readCheckedConfiguratorFieldLabels() {
    return uniqueLabels(
      (await this.readToggleTargets())
        .filter((field) => field.checked)
        .map((field) => field.label),
    );
  }

  async expectConfiguratorContainsLeadFormFields(formLabels: string[]) {
    await expect
      .poll(async () => {
        const configuratorLabels = await this.readVisibleConfiguratorFieldLabels();
        const normalizedBody = (await this.bodyText()).toLowerCase();
        return formLabels.filter((formLabel) => {
          const foundInParsedFields = configuratorLabels.some((configLabel) => this.sameLabel(configLabel, formLabel));
          return !foundInParsedFields && !normalizedBody.includes(normalizeFieldLabel(formLabel).toLowerCase());
        });
      }, { timeout: 30000 })
      .toEqual([]);
  }

  async expectCheckedFieldsVisibleOnLeadDetails(checkedLabels: string[]) {
    const labelsToValidate = checkedLabels.slice(0, 6);
    expect(labelsToValidate.length, "Lead overview configurator should have checked fields").toBeGreaterThan(0);

    const body = await this.bodyText();
    const missing = labelsToValidate.filter((label) => !this.bodyContainsLabel(body, label));
    expect(missing, `Checked lead detail fields were not visible on lead profile: ${labelsToValidate.join(", ")}`)
      .toEqual([]);
  }

  async firstCheckedFieldVisibleOnLeadDetails() {
    const checkedFields = (await this.readToggleTargets()).filter((field) => field.checked);
    return await this.firstVisibleLeadDetailFieldFrom(checkedFields.map((field) => field.label));
  }

  async firstVisibleLeadDetailFieldFrom(labels: string[]) {
    for (const label of labels.filter((fieldLabel) => this.isUsableFieldLabel(fieldLabel))) {
      await this.openFirstLeadDetailsFromCurrentState();
      if (this.bodyContainsLabel(await this.bodyText(), label)) {
        return label;
      }
      await this.page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
      await this.waitForLeadListingReady();
    }

    throw new Error(`No checked lead overview field was visible on a lead detail page. Checked fields: ${labels.join(", ")}`);
  }

  async pickVisibleLeadDetailFieldFromCurrentPage() {
    const body = await this.bodyText();
    const candidates = [
      "Lead ID",
      "Full Name",
      "Stage",
      "Source",
      "Sub Source",
      "Assigned To",
      "Create Date",
      "Update Date",
    ];
    const visible = candidates.find((label) => this.bodyContainsLabel(body, label) || body.toLowerCase().includes(label.toLowerCase()));
    if (!visible) {
      throw new Error("No expected lead detail/listing field was visible on the opened lead page.");
    }
    return visible;
  }

  async toggleFirstCustomLeadFormField() {
    const label = await this.tryToggleFirstCustomLeadFormField();
    if (!label) {
      throw new Error("Unable to click any custom lead form configurator toggle.");
    }
    await this.page.waitForTimeout(500);
    return label;
  }

  async tryToggleFirstCustomLeadFormField() {
    const label = await this.clickFirstCustomLeadFormFieldToggle();
    await this.page.waitForTimeout(500);
    return label;
  }

  async toggleLeadFormField(label: string) {
    await this.clickLeadFormFieldToggleByLabel(label);
    await this.page.waitForTimeout(500);
  }

  async pickToggleableField(preferChecked = true) {
    const fields = (await this.readToggleTargets()).filter((field) => this.isUsableFieldLabel(field.label));
    const preferred = fields.find((field) => field.checked === preferChecked) ?? fields[0];
    if (!preferred) {
      throw new Error("No configurable lead field with a visible toggle was found.");
    }

    return preferred;
  }

  async setFieldChecked(label: string, checked: boolean) {
    const target = await this.findToggleTarget(label);
    if (!target) {
      throw new Error(`Unable to find configurable field "${label}" to set checked=${checked}.`);
    }

    if (target.checked === checked) {
      return;
    }

    await this.clickFieldToggle(target.card);
    await expect
      .poll(async () => (await this.findToggleTarget(label))?.checked, { timeout: 10000 })
      .toBe(checked)
      .catch(() => {});
  }

  async saveConfigurator() {
    const saveButton = this.page.getByRole("button", { name: /^Save$/i }).first();
    if (!(await saveButton.isVisible({ timeout: 5000 }).catch(() => false))) {
      return;
    }

    await saveButton.click();
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.page.waitForTimeout(1000);
  }

  async expectFieldVisibleOnLeadDetails(label: string) {
    await expect
      .poll(async () => this.bodyContainsLabel(await this.bodyText(), label), { timeout: 30000 })
      .toBeTruthy();
  }

  async expectFieldHiddenFromLeadDetails(label: string) {
    await expect
      .poll(async () => this.bodyContainsLabel(await this.bodyText(), label), { timeout: 30000 })
      .toBeFalsy();
  }

  async expectFieldVisibleOnLeadForm(label: string) {
    await expect(this.page.getByRole("heading", { name: new RegExp(`^${escapeRegex(label)}\\s*\\*?$`, "i") }).first())
      .toBeVisible({ timeout: 30000 });
  }

  async expectFieldHiddenFromLeadForm(label: string) {
    await expect(this.page.getByRole("heading", { name: new RegExp(`^${escapeRegex(label)}\\s*\\*?$`, "i") }).first())
      .not.toBeVisible({ timeout: 30000 });
  }

  async closeLeadFormIfOpen() {
    const cancel = this.page.getByRole("button", { name: /^Cancel$/i }).first();
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
    }
  }

  private async openSettings(app: ConfigApp) {
    await this.page.goto("/admin/developer/cpms/manage-construction", { waitUntil: "domcontentloaded" });
    await ensureAuthenticatedSession(this.page, app, "/admin/developer/cpms/manage-construction");
    app.activeProjectName = await new ProjectSwitcherPage(this.page)
      .ensureActiveProject(app.activeProjectName)
      .catch(() => app.activeProjectName);

    await expect(this.settingsModuleButton).toBeVisible({ timeout: 30000 });
    await this.settingsModuleButton.click();
    if (await this.waitForSettingsCards(15000)) {
      return;
    }

    const imageSettingsButton = this.page
      .locator("button")
      .filter({ has: this.page.locator('img[alt*="settings" i]') })
      .first();
    if (await imageSettingsButton.isVisible().catch(() => false)) {
      await imageSettingsButton.click({ force: true });
    }
    await this.waitForSettingsCards(30000);
  }

  private async clickSettingsLink(pattern: RegExp, label: string) {
    await this.waitForSettingsCards(30000);
    const candidates = [
      this.page.getByRole("link", { name: pattern }).first(),
      this.page.getByRole("button", { name: pattern }).first(),
      this.page.locator("a, button, div").filter({ hasText: pattern }).first(),
    ];

    await clickFirstVisible(candidates, label, { force: true });
  }

  private async waitForSettingsCards(timeout: number) {
    return await expect
      .poll(async () => {
        const bodyText = await this.bodyText();
        return /Customi[sz]e Lead Form|Customi[sz]e Lead Overview|User Management|Lead Settings/i.test(bodyText);
      }, { timeout })
      .toBeTruthy()
      .then(() => true)
      .catch(() => false);
  }

  private async waitForConfiguratorReady() {
    await expect
      .poll(async () => (await this.readConfiguratorFields()).length, { timeout: 30000 })
      .toBeGreaterThan(0);
  }

  private async waitForLeadListingReady() {
    await expect(this.page.getByRole("textbox", { name: /Search by name, number, email/i }).first())
      .toBeVisible({ timeout: 60000 });
    await expect(this.page.locator('a[href*="engagement-intelligence/manage-leads"][href*="id="]').first())
      .toBeVisible({ timeout: 60000 });
  }

  private async readConfiguratorFields(): Promise<ConfigurableField[]> {
    return await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const labelFromFieldText = (text: string) => {
        const match = normalize(text).match(/(.+?)\s+\*?\s*Field type\s*:/i);
        if (!match) {
          return "";
        }

        return normalize(match[1])
          .split(/Form Fields|Form Preview|Lead Info|Preferences|Additional Details|Lead Details|Custom|System|Add Field/i)
          .map(normalize)
          .filter(Boolean)
          .pop() ?? "";
      };
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const fieldNameFromText = (text: string) => {
        const fieldLabel = labelFromFieldText(text);
        if (fieldLabel) {
          return fieldLabel;
        }

        const lines = text
          .split(/\n| {2,}/)
          .map(normalize)
          .filter(Boolean)
          .filter((line) => !/^(save|cancel|clear|reset|apply|settings|customi[sz]e|lead form|lead details|config\.?|mandatory|optional|required|system|custom|field|fields|drag|drop|type|select here)$/i.test(line));
        return lines[0] ?? "";
      };
      const isChecked = (card: HTMLElement) => {
        const input = card.querySelector<HTMLInputElement>('input[type="checkbox"], input[type="radio"]');
        if (input) {
          return input.checked;
        }

        const switchElement = card.querySelector<HTMLElement>('[role="switch"], [aria-checked]');
        if (switchElement?.getAttribute("aria-checked")) {
          return switchElement.getAttribute("aria-checked") === "true";
        }

        const selected = card.querySelector<HTMLElement>('[data-state="checked"], [aria-selected="true"]');
        if (selected) {
          return true;
        }

        const className = card.getAttribute("class") ?? "";
        return /bg-\[(#|rgb)|bg-primary|border-primary|text-white|checked/i.test(className);
      };

      const candidateCards = Array.from(document.querySelectorAll<HTMLElement>(
        'div[class*="rounded"], label, [role="option"], [role="switch"]',
      ))
        .filter(visible)
        .filter((element) => {
          const text = normalize(element.innerText || element.textContent);
          return text.length > 0 && text.length < 220;
        })
        .map((element) => {
          const card = element.closest<HTMLElement>('div[class*="rounded"]') ?? element;
          return card;
        })
        .filter((card, index, cards) => cards.indexOf(card) === index);

      const seen = new Set<string>();
      return candidateCards
        .map((card) => ({
          label: fieldNameFromText(card.innerText || card.textContent || ""),
          checked: isChecked(card),
        }))
        .filter((field) => field.label && field.label.length <= 80)
        .filter((field) => {
          const key = field.label.toLowerCase();
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
    });
  }

  private async readConfiguratorFieldLabelsFromText() {
    return await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const seen = new Set<string>();
      const lines = (document.body.innerText || "")
        .split(/\r?\n/)
        .map(normalize)
        .filter(Boolean);
      const labels: string[] = [];

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!/Field type\s*:/i.test(line)) {
          continue;
        }

        let label = normalize(line.split(/Field type\s*:/i)[0]).replace(/\s*\*$/, "");
        if (!label) {
          for (let lookBehind = index - 1; lookBehind >= Math.max(0, index - 4); lookBehind -= 1) {
            const candidate = lines[lookBehind].replace(/\s*\*$/, "");
            if (candidate && !/^\*|Custom|System|Lead Info|Preferences|Additional Details|Form Fields|Add Field$/i.test(candidate)) {
              label = candidate;
              break;
            }
          }
        }

        if (label) {
          labels.push(label);
        }
      }

      return labels.filter((label) => {
          const key = label.toLowerCase();
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
    });
  }

  private async readToggleTargets(): Promise<ToggleTarget[]> {
    const fieldToggleTargets = await this.readFieldTypeToggleTargets();
    if (fieldToggleTargets.length) {
      return fieldToggleTargets;
    }

    const cards = this.page.locator('div[class*="rounded"]').filter({ hasText: /\S/ });
    const count = await cards.count().catch(() => 0);
    const targets: ToggleTarget[] = [];

    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      if (!(await card.isVisible().catch(() => false))) {
        continue;
      }

      const label = await this.labelFromCard(card);
      if (!this.isUsableFieldLabel(label)) {
        continue;
      }

      const hasToggle = await this.cardHasToggle(card);
      if (!hasToggle) {
        continue;
      }

      targets.push({
        label,
        checked: await this.cardChecked(card),
        card,
      });
    }

    return targets;
  }

  private async readFieldTypeToggleTargets(): Promise<ToggleTarget[]> {
    const labels = await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const rowLabel = (text: string) => {
        const match = normalize(text).match(/(.+?)\s+\*?\s*Field type\s*:/i);
        if (!match) {
          return "";
        }
        return normalize(match[1])
          .split(/Form Fields|Form Preview|Lead Info|Preferences|Additional Details|Lead Details|Custom|System|Add Field/i)
          .map(normalize)
          .filter(Boolean)
          .pop() ?? "";
      };

      const seen = new Set<string>();
      return Array.from(document.querySelectorAll<HTMLElement>("div, label, section, article"))
        .filter(visible)
        .filter((element) => /Field type\s*:/i.test(normalize(element.innerText || element.textContent || "")))
        .filter((element) => Array.from(element.querySelectorAll("button")).some((button) => !button.disabled && visible(button)))
        .sort((left, right) =>
          normalize(left.innerText || left.textContent || "").length -
          normalize(right.innerText || right.textContent || "").length,
        )
        .map((element) => rowLabel(element.innerText || element.textContent || ""))
        .filter(Boolean)
        .filter((label) => {
          const key = label.toLowerCase();
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
    });

    return labels
      .filter((label) => this.isUsableFieldLabel(label))
      .map((label) => ({
        label,
        checked: true,
        card: this.fieldRowByLabel(label),
      }));
  }

  private async firstCustomLeadFormFieldLabel() {
    const label = await expect
      .poll(async () => {
        const labels = await this.page.evaluate(() => {
          const normalize = (value: string | null | undefined) =>
            (value ?? "").replace(/\s+/g, " ").trim();
          const rows = Array.from(document.querySelectorAll<HTMLElement>("div, label, section, article"))
            .map((element) => normalize(element.innerText || element.textContent || ""))
            .filter((text) => /Field type\s*:/i.test(text) && /\bCustom\b/i.test(text));

          for (const text of rows.sort((left, right) => left.length - right.length)) {
            const match = text.match(/(.+?)\s+\*?\s*Field type\s*:/i);
            const label = normalize(match?.[1] ?? "")
              .split(/Form Fields|Form Preview|Lead Info|Preferences|Additional Details|Lead Details|Custom|System|Add Field/i)
              .map(normalize)
              .filter(Boolean)
              .pop() ?? "";
            if (label && !/Form Fields|Add Field|Field type/i.test(label)) {
              return label;
            }
          }

          return "";
        });
        return labels;
      }, { timeout: 30000 })
      .not.toBe("")
      .then(async () => await this.page.evaluate(() => {
        const normalize = (value: string | null | undefined) =>
          (value ?? "").replace(/\s+/g, " ").trim();
        const rows = Array.from(document.querySelectorAll<HTMLElement>("div, label, section, article"))
          .map((element) => normalize(element.innerText || element.textContent || ""))
          .filter((text) => /Field type\s*:/i.test(text) && /\bCustom\b/i.test(text));
        for (const text of rows.sort((left, right) => left.length - right.length)) {
          const match = text.match(/(.+?)\s+\*?\s*Field type\s*:/i);
          const label = normalize(match?.[1] ?? "")
            .split(/Form Fields|Form Preview|Lead Info|Preferences|Additional Details|Lead Details|Custom|System|Add Field/i)
            .map(normalize)
            .filter(Boolean)
            .pop() ?? "";
          if (label && !/Form Fields|Add Field|Field type/i.test(label)) {
            return label;
          }
        }
        return "";
      }));

    return label;
  }

  private async clickFirstCustomLeadFormFieldToggle() {
    const label = await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const rowLabel = (text: string) => {
        const match = normalize(text).match(/(.+?)\s+\*?\s*Field type\s*:/i);
        return normalize(match?.[1] ?? "")
          .split(/Form Fields|Form Preview|Lead Info|Preferences|Additional Details|Lead Details|Custom|System|Add Field/i)
          .map(normalize)
          .filter(Boolean)
          .pop() ?? "";
      };
      const usable = (labelText: string) =>
        labelText &&
        labelText.length <= 80 &&
        !/Form Fields|Add Field|Field type|Form Preview|Lead Info|Preferences|Additional Details/i.test(labelText);

      for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("button"))) {
        if (button.disabled) {
          continue;
        }

        let row: HTMLElement | null = button.parentElement;
        for (let depth = 0; row && depth < 8; depth += 1) {
          const text = normalize(row.innerText || row.textContent || "");
          if (/Field type\s*:/i.test(text)) {
            const labelText = rowLabel(text);
            if (usable(labelText)) {
              button.scrollIntoView({ block: "center", inline: "center" });
              button.click();
              return labelText;
            }
          }
          row = row.parentElement;
        }
      }

      return "";
    });

    return this.isUsableFieldLabel(label) ? label : "";
  }

  private fieldRowByLabel(label: string) {
    return this.page
      .getByText(new RegExp(`^${escapeRegex(label)}$`, "i"))
      .first()
      .locator("xpath=ancestor::div[contains(., 'Field type')][1]");
  }

  private async clickLeadFormFieldToggleByLabel(label: string) {
    const clicked = await this.page.evaluate((targetLabel) => {
      const normalize = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const rowLabel = (text: string) => {
        const match = normalize(text).match(/(.+?)\s+\*?\s*Field type\s*:/i);
        if (!match) {
          return "";
        }
        return normalize(match[1])
          .split(/Form Fields|Form Preview|Lead Info|Preferences|Additional Details|Lead Details|Custom|System|Add Field/i)
          .map(normalize)
          .filter(Boolean)
          .pop() ?? "";
      };

      const rows = Array.from(document.querySelectorAll<HTMLElement>("div, label, section, article"))
        .filter(visible)
        .filter((element) => {
          const text = normalize(element.innerText || element.textContent || "");
          return /Field type\s*:/i.test(text) && (text.toLowerCase().includes(normalize(targetLabel).toLowerCase()) || /\bCustom\b/i.test(text));
        })
        .sort((left, right) =>
          normalize(left.innerText || left.textContent || "").length -
          normalize(right.innerText || right.textContent || "").length,
        );

      const normalizedTarget = normalize(targetLabel).toLowerCase();
      const row = rows.find((element) => {
        const text = normalize(element.innerText || element.textContent || "");
        return rowLabel(text).toLowerCase() === normalizedTarget || text.toLowerCase().includes(normalizedTarget);
      });
      const button = Array.from(row?.querySelectorAll<HTMLButtonElement>("button") ?? [])
        .find((candidate) => !candidate.disabled);
      if (!button) {
        return false;
      }

      button.scrollIntoView({ block: "center", inline: "center" });
      button.click();
      return true;
    }, label);

    if (!clicked) {
      const labelText = this.page.getByText(new RegExp(`^${escapeRegex(label)}$`, "i")).first();
      if (await labelText.isVisible().catch(() => false)) {
        await labelText.click({ force: true });
        return;
      }

      const clickedByLabelElement = await this.page.evaluate((targetLabel) => {
        const normalize = (value: string | null | undefined) =>
          (value ?? "").replace(/\s+/g, " ").trim();
        const visible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const labelNode = Array.from(document.querySelectorAll<HTMLElement>("div, span, p"))
          .find((element) => normalize(element.innerText || element.textContent).toLowerCase() === normalize(targetLabel).toLowerCase() && visible(element));
        if (!labelNode) {
          return false;
        }

        let row: HTMLElement | null = labelNode;
        for (let depth = 0; row && depth < 8; depth += 1) {
          if (/Field type\s*:/i.test(normalize(row.innerText || row.textContent || ""))) {
            const button = Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => !candidate.disabled);
            const target = button ?? row;
            target.scrollIntoView({ block: "center", inline: "center" });
            target.click();
            return true;
          }
          row = row.parentElement;
        }

        labelNode.scrollIntoView({ block: "center", inline: "center" });
        labelNode.click();
        return true;
      }, label);
      if (clickedByLabelElement) {
        return;
      }

      const xpathLabel = this.page
        .locator(`xpath=//*[normalize-space(.)=${JSON.stringify(label)}]`)
        .first();
      if (await xpathLabel.isVisible().catch(() => false)) {
        const row = xpathLabel.locator("xpath=ancestor::div[contains(., 'Field type')][1]");
        const button = row.locator("button").first();
        if (await button.isVisible().catch(() => false)) {
          await button.click({ force: true });
        } else {
          await xpathLabel.click({ force: true });
        }
        return;
      }

      throw new Error(`Unable to click lead form configurator toggle for "${label}".`);
    }
  }

  private async findToggleTarget(label: string) {
    const targets = await this.readToggleTargets();
    return targets.find((target) => this.sameLabel(target.label, label));
  }

  private async labelFromCard(card: Locator) {
    const text = normalizeText(await card.innerText().catch(() => ""));
    const fieldTypeMatch = text.match(/(.+?)\s+\*?\s*Field type\s*:/i);
    if (fieldTypeMatch) {
      const label = normalizeFieldLabel(
        fieldTypeMatch[1]
          .split(/Form Fields|Form Preview|Lead Info|Preferences|Additional Details|Lead Details|Custom|System|Add Field/i)
          .map(normalizeText)
          .filter(Boolean)
          .pop() ?? "",
      );
      if (label && !NON_FIELD_TEXT.test(label)) {
        return label;
      }
    }

    const line = text
      .split(/\n| {2,}/)
      .map(normalizeFieldLabel)
      .filter(Boolean)
      .find((candidate) => !NON_FIELD_TEXT.test(candidate) && candidate.length <= 80);
    return line ?? "";
  }

  private async cardHasToggle(card: Locator) {
    return await card
      .locator('input[type="checkbox"], input[type="radio"], [role="switch"], [aria-checked], svg')
      .first()
      .isVisible()
      .catch(() => false);
  }

  private async cardChecked(card: Locator) {
    return await card.evaluate((element) => {
      const input = element.querySelector<HTMLInputElement>('input[type="checkbox"], input[type="radio"]');
      if (input) {
        return input.checked;
      }

      const ariaChecked = element.querySelector<HTMLElement>('[aria-checked]')?.getAttribute("aria-checked");
      if (ariaChecked) {
        return ariaChecked === "true";
      }

      return /bg-\[(#|rgb)|bg-primary|border-primary|text-white|checked/i.test(element.getAttribute("class") ?? "");
    });
  }

  private async clickFieldToggle(card: Locator) {
    const toggle = card.locator('input[type="checkbox"], input[type="radio"], [role="switch"], [aria-checked], svg').first();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click({ force: true });
      return;
    }

    await card.click({ force: true });
  }

  private sameLabel(left: string, right: string) {
    return normalizeFieldLabel(left).toLowerCase() === normalizeFieldLabel(right).toLowerCase();
  }

  private labelFromFieldTypeText(text: string) {
    const match = normalizeText(text).match(/(.+?)\s+\*?\s*Field type\s*:/i);
    return normalizeFieldLabel(
      match?.[1]
        ?.split(/Form Fields|Form Preview|Lead Info|Preferences|Additional Details|Lead Details|Custom|System|Add Field/i)
        .map(normalizeText)
        .filter(Boolean)
        .pop() ?? "",
    );
  }

  private isUsableFieldLabel(label: string) {
    const normalized = normalizeFieldLabel(label);
    return Boolean(normalized) &&
      normalized.length <= 80 &&
      !NON_FIELD_TEXT.test(normalized) &&
      !/Field type|Form Fields|Add Field|Form Preview/i.test(normalized);
  }

  private bodyContainsLabel(body: string, label: string) {
    return new RegExp(`\\b${escapeRegex(normalizeFieldLabel(label))}\\b\\s*:`, "i").test(body)
      || new RegExp(`\\b${escapeRegex(normalizeFieldLabel(label))}\\b`, "i").test(body);
  }

  private async bodyText() {
    return normalizeText(await this.page.locator("body").innerText().catch(() => ""));
  }
}
