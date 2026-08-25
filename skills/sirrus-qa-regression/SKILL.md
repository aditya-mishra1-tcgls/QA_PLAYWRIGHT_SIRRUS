---
name: sirrus-qa-regression
description: Use when working on the Sirrus QA Playwright project in tcgls, especially for login, lead creation, site visit lifecycle, UAT environment details, project-specific selectors, staged lead references, and maintaining reusable QA flow knowledge over time.
---

# Sirrus QA Regression

Use this skill when updating or extending the Sirrus Playwright automation project.

## What this skill covers

- UAT login flow with mobile OTP
- Lead creation rules and seeded defaults
- Project-specific QA references for current staged leads
- Site visit lifecycle terminology and current known states
- Reusable maintenance workflow for adding new flows safely

## Workflow

1. Read [references/project-context.md](references/project-context.md) for current environment and known lead references.
2. Read [references/flow-map.md](references/flow-map.md) for the current automated flow inventory and pending cases.
3. Prefer updating config or shared helpers before adding one-off selectors inside a spec.
4. When a field depends on a previous selection, wait on the UI post-condition or dependent control readiness before continuing.
5. After learning a new stable selector path or stage rule, update the references in this skill so future runs reuse it.

## Update rules

- Keep environment details in project config files, not inside specs.
- Keep current known UAT lead IDs and detail URLs in the references files only if they are being used as stable non-destructive fixtures.
- When a flow is only partially automated, document the known blocker and the next safe step in `references/flow-map.md`.

## References

- Read `references/project-context.md` for environment, login, and fixed test data conventions.
- Read `references/flow-map.md` for implemented flows, pending flows, and current blockers.
