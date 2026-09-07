# TCGLS QA Playwright Automation

This project is organized flow-wise so we can add UI journeys gradually and run them sequentially.

## Starter structure

- `tests/flows/smoke`: smoke journeys
- `tests/flows/auth`: login and authentication journeys
- `tests/flows/user-management`: admin user creation and user access journeys
- `tests/flows/lead-management`: lead creation and lead actions
- `tests/flows/site-visit`: site visit lifecycle validation
- `tests/setup`: shared one-time login setup for all authenticated tests
- `tests/data`: reusable test data
- `tests/support`: shared helpers and fixtures
- `docs/features`: feature requirements, dynamic data rules, and automation mapping
- `docs/templates`: templates for documenting new features before or alongside automation
- `config/environments.json`: change `qa` and `uat` base URLs here
- `config/accounts.local.json`: keep environment-wise credentials here
- `config/flows.json`: single ordered list for sequential execution
- `config/execution-profiles.json`: named manual execution modes
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
npm run test:manual -- --mode=regression --env=uat
npm run test:manual -- --flows=smoke,lead-management --env=qa
npm run test:manual -- --mode=user-management --env=uat
npm run test:headed
npm run dashboard
```

Manual execution planning and report steps are documented in `docs/MANUAL_EXECUTION.md`.

## Local Dashboard

Start the dashboard:

```bash
npm run dashboard
```

Open `http://localhost:9324`.

The dashboard lets you choose environment, execution mode, flows, specific spec files, project, grep, workers, retries, headed mode, and debug mode. It streams Playwright logs in realtime and shows test names, step names, step duration, pass/fail status, and errors in the browser.

For a server deployment, set `QA_DASHBOARD_HOST=0.0.0.0` and expose `QA_DASHBOARD_PORT` through your firewall, reverse proxy, or load balancer. The browser page will show realtime execution from anywhere that can reach the server. If headed mode is enabled, the Playwright browser window opens on the server itself; use VNC/noVNC or a desktop session if you want to watch that headed browser visually.

Protect the dashboard with browser login before exposing it:

```bash
QA_DASHBOARD_AUTH_USERNAME=admin
QA_DASHBOARD_AUTH_PASSWORD=<strong-password>
```

These values bootstrap the first dashboard admin. After login, the admin-only **Dashboard Users** section can create more dashboard users. Created users are stored locally in `config/dashboard-users.local.json`, which is ignored by git. Normal users can open the dashboard and run/view tests, but only admins can create dashboard users.

Each dashboard user can save their own app-test login from the **Configuration** page. Runs started by that user use their saved app login for the selected environment. If no user-specific app login is saved, tests fall back to the current shared `config/accounts.local.json` credentials.

When the dashboard is bound to anything other than localhost, the server refuses to start unless both auth variables are configured.

If the dashboard is hosted under a path prefix, set `QA_DASHBOARD_BASE_PATH`. For example, `https://dev-wag.sirrus.ai/qa-playwrite/` should use `QA_DASHBOARD_BASE_PATH=/qa-playwrite` unless the reverse proxy strips the prefix before forwarding to Node.

Run data is stored locally under `data/test-runs/<run-id>`:

- `run.json`: run metadata, selected options, summary, tests, steps, and errors
- `events.ndjson`: append-only realtime event stream
- `output.log`: raw Playwright output
- `html-report`: Playwright HTML report assets

This local folder is intentionally ignored by git. For permanent storage, configure PostgreSQL and S3-compatible object storage in `.env` using the variables in `.env.example`. The dashboard then stores every run payload in PostgreSQL and uploads all run artifacts (HTML report, screenshots, videos, traces, logs, and retry artifacts) to the configured bucket when the run finishes. Each failed test captures a viewport image, full-page image, and a second viewport image after one second; users can open these from the **Failure screenshots** section on the test card. Local files remain available as a fallback.

PostgreSQL is the source of truth for metadata; S3 is the source of truth for larger static files. This works with AWS RDS + S3, or managed alternatives such as Neon/Supabase + Cloudflare R2.

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

## Feature Requirements

Keep exact feature functionality in `docs/features/` and update it whenever tests change.

Organize feature docs by domain first:

- `docs/features/engagement/...`
- `docs/features/martech/...`
- `docs/features/post-sales/...`

Current examples:

- `docs/features/engagement/lead-management.md`
- `docs/features/engagement/site-visit.md`
- `docs/TEST_STRATEGY.md`

When adding a new test or changing behavior:

1. identify domain and module first
2. update the matching feature file
3. add or update the Playwright spec
4. mark the automation status in the feature file

Suggested intake examples:

- `engagement -> lead-report`
- `engagement -> lead-management`
- `martech -> campaign-report`
- `post-sales -> handover`

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

## User Management And Parallel Runs

- Admin/user-management coverage is registered as the `user-management` execution profile.
- Keep real admin and automation-user credentials in `config/accounts.local.json`; use `config/accounts.template.json` as the shape.
- For parallel execution, configure at least one automation user per Playwright worker.
- Avoid sharing the same login account across concurrent data-mutating tests. When three team members run scenarios at the same time, use three separate accounts or three separate account pools.
- For a future email/password login path, save auth state per user, for example `playwright/.auth/uat-worker-1.json`, instead of sharing only `playwright/.auth/uat.json`.
- Test data that creates users, leads, reports, or visits should include a unique run id, worker index, or timestamp in names/emails/mobile numbers.

## Adding a new flow

1. Create a new folder under `tests/flows`, for example `tests/flows/booking`.
2. Add one or more `.spec.ts` files inside that folder.
3. Create or update the matching feature document from `docs/templates/feature-spec.template.md`.
4. Run it sequentially with `npm run test:flows -- smoke auth booking`.

Each folder represents one business flow, so we can execute multiple flows in a fixed order.
