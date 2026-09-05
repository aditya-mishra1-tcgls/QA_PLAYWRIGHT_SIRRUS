# Interaction Rules

## Goal

Follow the same interaction patterns already working in this repo so new tests stay stable through normal UI changes.

## First Principle

Before writing a new interaction pattern, check whether an existing helper in `tests/support/` already solves it.

Prefer extending a shared helper over adding one-off click, scroll, dropdown, or wait logic in a single spec.

## Current Reusable Patterns In This Repo

- `clickWithFallback(...)`
  Click an element, then wait for a post-click condition; if the UI lags, use a controlled fallback delay.
- `clickFirstVisible(...)`
  Try multiple locator candidates in order and use the first visible one.
- `waitForHiddenWithFallback(...)`
  Wait for a modal or panel to hide; if immediate hidden-state wait fails, allow a fallback delay and retry.
- `fillFirstVisibleField(...)`
  Try multiple candidate inputs and fill the first visible one.

These patterns are already used in:

- `tests/support/auth.ts`
- `tests/support/leads.ts`
- `tests/support/site-visit.ts`

## Click Rules

Prefer click targets in this order:

1. `getByRole(...)` with a stable accessible name
2. exact visible text for a business action
3. text-scoped button locator
4. CSS or XPath fallback only when there is no stable semantic target

For important actions, do not use a bare click alone.

Wrap the click with a post-check similar to the current `clickWithFallback(...)` pattern:

- click the CTA
- verify the next expected UI state
- if the state does not appear quickly, allow a controlled fallback wait

Examples already used by the repo:

- click `Log in`, then wait for `#mobile_number`
- click project switcher, then wait for dropdown options
- click `Change Stage`, then wait for `Choose a stage`
- click stage option, then wait for sub-stage or date controls

## CTA And Icon Rules

Prefer a text-labeled CTA over an icon-only target.

If the UI exposes only an icon:

1. scope to the nearest stable container
2. prefer `button` with `img[alt*=...]` or a nearby stable label
3. verify the next UI state after click

Current repo example:

- the Engagement module button is located through `button` containing an image whose `alt` includes `engagement`

Avoid:

- clicking generic icons with no scoped container
- raw positional clicks unless existing fallbacks already require them

If a positional click is unavoidable, keep it inside a shared helper and always pair it with a navigation or visibility check.

## Dropdown Rules

Use this repo's current pattern for dropdown selection:

1. open the dropdown through a stable label or button
2. wait until option container is visible
3. poll until options are actually populated
4. select a preferred option when business rules define a preference order
5. wait for the dependent field or selected value to settle

Current repo behavior:

- `dropdownFor(page, label)` finds the button next to the field label
- `waitForDropdownOptions(...)` waits for visible modal options and verifies option text exists
- `chooseFirstOption(...)` selects preferred options first, otherwise first valid option
- dependent selection waits are used before continuing to next field

For dependent dropdowns:

- `Project Name` must settle before `Source`
- `Source` must settle before `Sub Source`
- if the dependent field is disabled, wait until disabled state clears

Do not:

- open a dropdown and immediately click the first item without checking that options have loaded
- rely only on a fixed delay when a dependent field has a visible readiness signal

## Scroll Rules

Use `scrollIntoViewIfNeeded()` before interacting with fields or save buttons that may be below the fold.

For scrollable dropdowns or popups:

- use controlled incremental scroll inside the visible scroll container
- retry visibility after each scroll step

Current repo behavior:

- project dropdown scrolling uses DOM-based scroll detection and incremental `scrollTop` movement
- popup date option selection retries with scroll when the target option is not initially visible

Avoid:

- scrolling the whole page blindly when the real scrollable element is a nested popup
- large one-shot scroll jumps without rechecking visibility

## Modal Rules

When the UI opens a modal:

1. scope interactions to `#root-modal` first when possible
2. use modal-scoped `Save` before generic page-level `Save`
3. wait for the modal to hide before assuming the action completed

Current repo examples:

- lead form save uses `page.locator("#root-modal").getByRole("button", { name: /^save$/i })`
- when modal-scoped save is not available, the helper falls back to a generic visible save button

## Wait Rules

Prefer waiting in this order:

1. URL change
2. expected element visible
3. expected element hidden
4. expected text or field value
5. expected response or network milestone
6. only then a small fallback delay

Current repo examples:

- `waitForURL(...)` after opening a lead or leaving login
- `expect(...).toBeVisible(...)` for modal headings and key controls
- `expect.poll(...)` against body text, field visibility, or option counts
- controlled fallback waits like `800ms`, `1200ms`, `1500ms`, `2000ms`, or `5000ms` only when the UI remains laggy after a post-check

Do not default to `waitForTimeout(...)` as the primary synchronization method.

If a fallback delay is necessary:

- keep it in a shared helper
- pair it with an explicit reason such as render lag, dependent dropdown lag, or modal close lag

## Date Picker Rules

Use a dual-path strategy for dates:

1. try the visible date picker control first
2. if the picker is inconsistent, fall back to filling a visible date input directly

Current repo behavior for site visit booking:

- prefers a `Start Date` button
- waits for a named date option such as `Choose <weekday>, <month> <day>, ...`
- scrolls the popup when the option is not visible
- falls back to a visible `input[type="date"]` or related date field

When writing new date selection logic:

- generate the target date in code
- prefer ISO date fill for raw `input[type="date"]`
- verify the field is visible before filling
- use a shared helper for reusable date selection patterns

## Time Picker Rules

Use the same visible-first fallback pattern as date inputs.

Current repo behavior:

- checks `input[type="time"]`
- falls back to placeholders, `name`, or `id` containing `time`
- fills a stable test value such as `10:30`

For new time pickers:

- prefer semantic time input if available
- otherwise use the closest visible field with stable placeholder or name
- verify the field is visible before filling

## Field Fill Rules

Prefer deterministic field locators:

1. `#id`
2. `name`
3. semantic type such as `input[type="email"]`
4. label-based relative locator
5. placeholder fallback only if needed

Current repo examples:

- `#fullName`
- `#whatsAppNumber`
- `#sourceCategory`
- `#email`, then name/type/label-based fallbacks

If multiple variants exist across environments, keep the candidate list in a shared helper rather than branching in specs.

## Assertion-After-Action Rules

After save or stage change, assert the business result:

- saved text visible in body or form
- field value persisted after reopening
- expected stage label visible
- expected URL or profile state loaded

Current repo examples:

- reopen lead edit form and verify saved name and email values
- poll until `In Progress` appears after stage save
- verify created lead is searchable in listing

## What To Do For New Test Cases

When adding a new test:

1. look for an existing helper with the same interaction shape
2. if none exists, add a shared helper in `tests/support/`
3. use multi-candidate semantic locators before brittle selectors
4. add a post-click or post-save expectation
5. keep fallback delays centralized and minimal
