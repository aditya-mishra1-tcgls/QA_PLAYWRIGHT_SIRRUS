# Manual Automation Execution Plan

Use this workflow until CI/CD triggers are added.

## Roles

- Tester writes or updates Playwright specs locally.
- Tester runs the impacted flow locally before raising or merging changes.
- QA owner runs a shared manual pack after changes are merged.
- Team reviews the generated HTML report from the same repo.

## Local Tester Flow

1. Pull latest code.
2. Update feature documentation in `docs/features`.
3. Add or update specs under `tests/flows`.
4. Run the smallest matching mode locally.
5. Fix failures before merge.

Examples:

```bash
npm run test:manual -- --mode=lead --env=uat --headed
npm run test:manual -- --flows=lead-management --env=qa
npm run test:manual -- tests/flows/lead-management
```

## Manual Shared Run

After automation changes are merged, run one of these from the shared machine or any tester laptop:

```bash
npm run test:manual:uat -- --mode=smoke
npm run test:manual:uat -- --mode=regression
npm run test:manual:qa -- --mode=regression
```

Every run saves an HTML report under `reports/<timestamp-env-mode-flows>`.

Open a report with:

```bash
npx playwright show-report reports/<report-folder>
```

## Execution Modes

Modes are configured in `config/execution-profiles.json`.

- `smoke`: quick health check.
- `auth`: login and authentication only.
- `lead`: smoke plus lead-management.
- `site-visit`: smoke plus site-visit.
- `regression`: every registered flow, including user-management, engagement, site-visit, and martech.

To run exact flows without changing the profile file:

```bash
npm run test:manual -- --flows=smoke,lead-management,site-visit --env=uat
```

## Later CI/CD Upgrade

When ready, use the same commands in GitHub Actions, Jenkins, or another runner:

- pull merged branch
- install dependencies
- install Playwright browsers
- run `npm run test:manual:uat -- --mode=regression`
- publish the `reports` folder as a build artifact

This keeps the manual process and future automated trigger using the same command.
