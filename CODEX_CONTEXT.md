# Codex Context

Use this file when starting a new Codex task for this project.

## Project Path

```bash
/Users/aakarshyadav/Desktop/tcgls/qa-playwright-automation
```

## Goal

This repo contains flow-wise Playwright automation for Sirrus CRM style QA journeys.
Main focus so far:

- login
- lead creation
- edit lead
- lead stage change
- site visit support flows

## Environment Model

- Active environment comes from `TEST_ENV` in `.env`
- Base URLs come from `config/environments.json`
- Credentials come from `config/accounts.local.json`
- Default project is `Test1303`

Important:

- Do not hardcode `uat.sirrus.ai` or `qa.sirrus.ai` inside tests or helper scripts.
- Use relative routes like `/admin/developer/...` whenever possible.

## Important Shared Helpers

- `tests/support/test.ts`
  - exposes shared `app` fixture
- `tests/support/env.ts`
  - loads env, credentials, base URL, project name
- `tests/support/auth.ts`
  - login/auth state and project selection
- `tests/support/leads.ts`
  - reusable lead creation, open, edit, and stage helpers
- `tests/support/site-visit.ts`
  - reusable site visit detail helpers

## Current Working Patterns

- Login is reused through `tests/setup/auth.setup.ts`
- Local CLI auth state is saved to `playwright/.auth/<env>.json`; dashboard runs use `playwright/.auth/<env>-<run-id>.json` and clean that execution-specific file after the run completes
- Project must be switched to `Test1303` after login
- For dependent dropdowns like project, source, and sub source:
  - wait for options
  - allow backend/API time before selecting next dependent field
- For lead profile actions:
  - wait for the lead profile to fully render before clicking `Edit Lead Form` or `Change Stage`

## Good Existing Specs To Reuse

- `tests/flows/lead-management/lead-stage-change.spec.ts`
- `tests/flows/lead-management/edit-lead.spec.ts`
- `tests/flows/lead-management/lead-creation.spec.ts`

## Common Commands

Install and setup:

```bash
npm install
npx playwright install
cp .env.example .env
```

Run all:

```bash
npm run test
```

Run by environment:

```bash
npm run test:qa
npm run test:uat
```

Run headed for realtime browser view:

```bash
npx playwright test tests/flows/lead-management/lead-stage-change.spec.ts --project=chromium --headed
npx playwright test tests/flows/lead-management/edit-lead.spec.ts --project=chromium --headed
```

## How To Add A New Test

1. Reuse the `app` fixture from `tests/support/test.ts`
2. Reuse existing helpers from `tests/support` before adding new locators
3. Add the spec under the correct flow folder in `tests/flows`
4. Keep assertions on stable UI text or verified field values
5. Avoid exact checks against truncated display text when the form has a `maxlength`

## If Starting A New Thread

You can paste this prompt into a new Codex task:

```text
Open /Users/aakarshyadav/Desktop/tcgls/qa-playwright-automation
Read README.md and CODEX_CONTEXT.md first.
Use TEST_ENV from .env and do not hardcode environment URLs.
Reuse helpers from tests/support before writing new locators.
Keep project selection on Test1303.
Write and run the new Playwright test in headed mode if realtime browser view is requested.
```
