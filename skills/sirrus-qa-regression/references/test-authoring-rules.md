# Test Authoring Rules

## Goal

Write scalable Playwright tests that work across supported environments and remain stable through normal UI changes.

## Environment Rules

- Use `TEST_ENV` from `.env` through shared env helpers.
- Read base URLs from `config/environments.json`.
- Read credentials and OTP values from `config/accounts.local.json`.
- Do not hardcode environment URLs, credentials, OTP values, or project names inside specs.
- Use the shared `app` fixture from `tests/support/test.ts`.

## Project Rules

- Keep project selection config-driven.
- Use the active project from shared environment/config helpers.
- Do not hardcode a project inside a spec unless the request explicitly requires a single-project test.
- If project-specific behavior is required, document it in `docs/features/` and in `references/project-context.md`.

## Test Structure Rules

- Prefer domain-first executable test planning under `tests/flows/<domain>/<feature>/`.
- Put reusable interactions in `tests/support/`.
- Prefer adding or extending helpers before duplicating UI logic inside a spec.
- Keep spec names action-based and readable.
- Keep each spec focused on one behavior or one closely related behavior pack.
- For new UI journeys, start with Playwright `codegen` capture, then rewrite the generated output into maintainable project-style automation.

## Data Lifecycle Rules

Do not make one spec depend on another spec.

Use one of these modes:

- `fresh`
  Create a new record for the test
- `shared`
  Reuse one record for a small related workflow pack
- `seeded`
  Use a known existing record in a specific state

Default to `fresh` for CI-safe coverage.
Use `shared` only for intentionally serial workflow packs.
Use `seeded` only when a specific state is expensive or unsafe to recreate.

## Locator Rules

Prefer locators in this order:

1. accessible role with stable name
2. associated label or placeholder
3. stable visible text tied to the business action
4. test id if the app provides one
5. scoped CSS or XPath only as a last resort

Avoid:

- indexes like `nth(0)` unless the UI truly guarantees position
- brittle class-name selectors tied to styling
- long absolute XPath chains
- assertions on text that is known to truncate visually

When using a fallback selector:

- scope it to the smallest stable container
- explain the reason with a brief code comment if not obvious
- follow the concrete patterns documented in `references/interaction-rules.md`

## Assertion Rules

- Assert business outcomes, not only clicks.
- Prefer verifying URL change, saved field value, stage badge, listing visibility, modal state, or success text.
- Avoid assertions on unstable animation states.
- When values can truncate in UI, assert on a stable partial value or on the form field value instead.

## Waiting Rules

- Prefer event- or state-based waiting over fixed sleeps.
- For dependent dropdowns, wait for the next control to become ready before continuing.
- Use post-action checks when a click may succeed before the UI fully settles.
- Use fixed timeout fallback only when the product has unavoidable rendering lag.
- Reuse or mirror the existing helper patterns such as `clickWithFallback(...)`, visible-first field selection, modal-scoped save handling, and popup scroll retries.

## Feature Documentation Rules

When adding or changing a test case:

1. update the matching file in `docs/features/`
2. note dynamic data and fixed data
3. note required preconditions and stage/state
4. update automation status and mapped spec file

## Safe Change Rules

- Preserve shared helpers unless there is a clear reason to refactor.
- Do not break existing environment support while adding a new flow.
- If a selector is fragile in one environment, prefer a shared helper fix instead of per-spec branching.
- Never leave raw codegen output as the final test implementation.
