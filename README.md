# TCGLS QA Playwright Automation

This project is organized flow-wise so we can add UI journeys gradually and run them sequentially.

## Starter structure

- `tests/flows/smoke`: smoke journeys
- `tests/flows/auth`: login and authentication journeys
- `tests/flows/lead-management`: lead creation and lead actions
- `tests/flows/site-visit`: site visit lifecycle validation
- `tests/setup`: shared one-time login setup for all authenticated tests
- `tests/data`: reusable test data
- `tests/support`: shared helpers and fixtures
- `config/environments.json`: change `qa` and `uat` base URLs here
- `config/accounts.local.json`: keep environment-wise credentials here
- `config/flows.json`: single ordered list for sequential execution
- `scripts/run-flows.mjs`: sequential runner for one or many flow folders

## Setup

```bash
npm install
npx playwright install
cp .env.example .env
```

Set `TEST_ENV=qa` or `TEST_ENV=uat` in `.env`.
Update login data in `config/accounts.local.json`.

Base URLs are already configured here:

- `qa`: `https://qa.sirrus.ai/`
- `uat`: `https://uat.sirrus.ai/`

## Useful commands

```bash
npm run test
npm run test:qa
npm run test:uat
npm run test:smoke
npm run test:auth
npm run test:flows
npm run test:headed
```

## Run With Codex

Open this project folder in Codex:

```bash
/Users/aakarshyadav/Desktop/tcgls/qa-playwright-automation
```

Quick handoff context for a separate Codex task:

- `CODEX_CONTEXT.md`

Typical Codex runs used for live QA:

```bash
npx playwright test tests/flows/lead-management/lead-stage-change.spec.ts --project=chromium --headed
npx playwright test tests/flows/lead-management/edit-lead.spec.ts --project=chromium --headed
```

Notes for Codex usage:

- Keep the project selection configured as `Test1303`.
- Use `--headed` when you want realtime browser view.
- Reuse shared helpers from `tests/support` instead of duplicating flow logic.
- Update env, project, and account details from config files before running new flows.

## Config model

- Switch target environment by changing `TEST_ENV` in `.env`.
- Change URLs in `config/environments.json`.
- Keep real login data in `config/accounts.local.json`.
- Keep reusable mock records in `tests/data`, for example `tests/data/leads.json`.
- Control the full sequential suite in `config/flows.json`.

Tests can read the selected environment through the shared `app` fixture:

```ts
app.envName
app.baseUrl
app.mobileNumber
app.otp
app.leads[app.envName]
```

## Login baseline

- The suite logs in once through `tests/setup/auth.setup.ts`.
- The authenticated browser state is saved under `playwright/.auth/<env>.json`.
- All normal test flows reuse that state automatically, which keeps execution fast.

## Adding a new flow

1. Create a new folder under `tests/flows`, for example `tests/flows/booking`.
2. Add one or more `.spec.ts` files inside that folder.
3. Run it sequentially with `npm run test:flows -- smoke auth booking`.

Each folder represents one business flow, so we can execute multiple flows in a fixed order.
