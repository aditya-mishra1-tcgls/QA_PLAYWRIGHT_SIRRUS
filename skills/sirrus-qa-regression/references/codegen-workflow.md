# Codegen Workflow

## Goal

When a teammate asks to write a new test case, use Playwright `codegen` to capture the real user journey first, then convert that rough recording into scalable project-quality automation.

## When To Use

Use this workflow when:

- the feature is new
- selectors are unknown
- the journey is long or UI-heavy
- the teammate wants to demonstrate the exact clicks and inputs

## Core Rule

Do not keep raw codegen output as the final test.

Treat codegen as a discovery step for:

- selector discovery
- navigation discovery
- modal sequence discovery
- dropdown and date-picker behavior discovery

## Standard Workflow

1. Launch Playwright codegen for the correct environment.
2. Let the user or tester perform the journey in the browser.
3. Capture the generated actions.
4. Extract only the useful selector and workflow knowledge.
5. Rewrite the result into shared helpers and a proper spec.
6. Add assertions for business outcomes.
7. Update `docs/features/` for the covered behavior.

## Preferred Command

Use the environment-aware base URL from project config and prefer the Chromium project.

Typical pattern:

```bash
npx playwright codegen <base-url>
```

If the task is environment-specific, use the selected environment URL from config rather than hardcoding it in the test.

## What The User Should Do During Codegen

The user should:

- log in if needed
- switch to the correct project if needed
- perform the exact journey once
- mention any important validations or expected outcomes not visible from clicks alone

## What Codex Should Extract From Codegen

Keep:

- stable role-based selectors
- stable labels and visible action names
- modal open and close sequence
- field order and dependencies
- date/time interaction shape
- URLs and page transitions

Discard or rewrite:

- brittle nth selectors
- style-driven selectors
- unnecessary repeated waits
- extra clicks caused by recording noise
- generated assertions that do not verify business behavior

## Rewrite Rules

After codegen:

1. move reusable interactions into `tests/support/`
2. keep the spec focused on behavior
3. replace brittle selectors with the repo's preferred locator strategy
4. add post-click and post-save waits using shared patterns
5. make the test work across `qa` and `uat` where applicable
6. document dynamic and fixed data in the related feature doc

## If Codegen Is Not Available

If GUI/browser launch is blocked, fall back to:

- existing helpers
- headed manual run observations
- DOM inspection from current tests

But prefer codegen whenever a teammate wants to show the real journey for a new flow.
