import { expect, type Locator, type Page } from "@playwright/test";

export const DEFAULT_RENDER_FALLBACK_MS = 5000;

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export async function hasVisibleText(page: Page, textPattern: RegExp) {
  return await page
    .getByText(textPattern)
    .first()
    .isVisible()
    .catch(() => false);
}

export async function hasVisibleHeading(page: Page, headingPattern: RegExp) {
  return await page
    .getByRole("heading", { name: headingPattern })
    .first()
    .isVisible()
    .catch(() => false);
}

export async function clickWithFallback(
  locator: Locator,
  page: Page,
  postCheck?: () => Promise<boolean>,
  options?: Parameters<Locator["click"]>[0],
  fallbackMs = DEFAULT_RENDER_FALLBACK_MS
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
    await page.waitForTimeout(fallbackMs);
  }
}

export async function waitForHiddenWithFallback(
  locator: Locator,
  page: Page,
  timeout = 60000,
  fallbackMs = DEFAULT_RENDER_FALLBACK_MS
) {
  const hidden = await locator
    .waitFor({ state: "hidden", timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (hidden) {
    return;
  }

  await page.waitForTimeout(fallbackMs);
  await expect(locator).not.toBeVisible({ timeout });
}

export async function clickFirstVisible(
  candidates: Locator[],
  label: string,
  options?: Parameters<Locator["click"]>[0]
) {
  for (const candidate of candidates) {
    const target = candidate.first();
    if (await target.isVisible().catch(() => false)) {
      await target.scrollIntoViewIfNeeded().catch(() => {});
      await target.click(options);
      return target;
    }
  }

  throw new Error(`Unable to find visible ${label}.`);
}

export async function tryClickFirstVisible(
  candidates: Locator[],
  options?: Parameters<Locator["click"]>[0]
) {
  for (const candidate of candidates) {
    const target = candidate.first();
    if (await target.isVisible().catch(() => false)) {
      await target.scrollIntoViewIfNeeded().catch(() => {});
      await target.click(options);
      return true;
    }
  }

  return false;
}

export async function fillFirstVisible(
  candidates: Locator[],
  value: string,
  label: string
) {
  for (const candidate of candidates) {
    const target = candidate.first();
    if (await target.isVisible().catch(() => false)) {
      await target.fill(value);
      return target;
    }
  }

  throw new Error(`Unable to find visible ${label} field.`);
}

export async function fillWithFallback(locator: Locator, value: string) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout: 2500 }).catch(() => {});

  const filledByPlaywright = await locator
    .fill(value, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (filledByPlaywright) {
    return true;
  }

  return await locator
    .evaluate((element, nextValue) => {
      const target = element as HTMLInputElement | HTMLTextAreaElement;
      if ("value" in target) {
        const valueSetter = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(target),
          "value",
        )?.set;
        valueSetter?.call(target, nextValue);
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return target.value === nextValue;
      }

      const editable = element as HTMLElement;
      editable.textContent = nextValue;
      editable.dispatchEvent(new InputEvent("input", { bubbles: true, data: nextValue }));
      editable.dispatchEvent(new Event("change", { bubbles: true }));
      return editable.textContent === nextValue;
    }, value)
    .catch(() => false);
}

export function visibleCandidate(page: Page, selectors: string[]) {
  return page
    .locator(selectors.join(", "))
    .filter({ hasNot: page.locator("[disabled]") })
    .first();
}
