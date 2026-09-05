---
name: sirrus-qa-regression
description: Use when working on the Sirrus QA Playwright project in tcgls, especially to create or update scalable Playwright test cases, reuse project and environment rules, choose stable selectors, handle shared versus fresh lead data, maintain feature requirement docs, and preserve reusable QA flow knowledge for qa and uat environments.
---

# Sirrus QA Regression

Use this skill when updating or extending the Sirrus Playwright automation project.

## What this skill covers

- Domain-first test planning for `engagement`, `martech`, and `post-sales`
- Project and environment rules for `qa` and `uat`
- Scalable Playwright test authoring rules
- Stable selector and assertion strategy
- Shared versus fresh versus seeded data planning
- Lead management and site visit feature requirements
- Reusable maintenance workflow for adding new flows safely

## Workflow

1. Read [references/project-context.md](references/project-context.md) for current environment and known lead references.
2. Read [references/flow-map.md](references/flow-map.md) for the current automated flow inventory and pending cases.
3. Read [references/test-intake-rules.md](references/test-intake-rules.md) before planning a new test case.
4. Read [references/test-authoring-rules.md](references/test-authoring-rules.md) before adding or changing test cases.
5. Read [references/interaction-rules.md](references/interaction-rules.md) before writing new clicks, dropdown logic, scroll handling, date picking, or wait logic.
6. Read [references/feature-doc-workflow.md](references/feature-doc-workflow.md) when the request adds or changes feature behavior coverage.
7. Read [references/codegen-workflow.md](references/codegen-workflow.md) when a teammate asks to write a new test case or capture a fresh UI journey.
8. Prefer updating config or shared helpers before adding one-off selectors inside a spec.
9. When a field depends on a previous selection, wait on the UI post-condition or dependent control readiness before continuing.
10. After learning a new stable selector path, project rule, stage rule, or feature condition, update the references in this skill so future runs reuse it.

## Update rules

- Keep environment details in project config files, not inside specs.
- Keep current known lead IDs and detail URLs in the references files only if they are being used as stable non-destructive fixtures.
- When a flow is only partially automated, document the known blocker and the next safe step in `references/flow-map.md`.
- When test coverage changes, update the related file in `docs/features/` in the same change.
- Prefer environment-safe, low-fragility locators over style- or position-driven selectors.

## References

- Read `references/project-context.md` for environment, login, and fixed test data conventions.
- Read `references/flow-map.md` for implemented flows, pending flows, and current blockers.
- Read `references/test-intake-rules.md` for the required first question and domain/module intake flow.
- Read `references/test-authoring-rules.md` for selector, assertion, data, and structure rules.
- Read `references/interaction-rules.md` for click, dropdown, scroll, modal, date, time, and wait patterns already used by the project.
- Read `references/feature-doc-workflow.md` for documentation and coverage update rules.
- Read `references/codegen-workflow.md` for how to use Playwright codegen as a capture step before turning the journey into maintainable automation.
