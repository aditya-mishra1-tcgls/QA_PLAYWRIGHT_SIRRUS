# Test Intake Rules

## Goal

Start every new test-case request from domain and module selection before writing automation.

## Required First Question

When someone says:

- let's write a new test case
- add a new automation flow
- create a new regression case

First ask for:

1. domain
2. feature or module name

Use this structure:

- `engagement`
- `martech`
- `post-sales`

Then ask for the module inside that domain.

## Example Intake

- `engagement -> lead-management`
- `engagement -> lead-report`
- `engagement -> site-visit`
- `martech -> campaign-report`
- `post-sales -> handover`

## Folder Planning Rule

Plan docs and tests in domain-first shape:

- `docs/features/engagement/<module>.md`
- `docs/features/martech/<module>.md`
- `docs/features/post-sales/<module>.md`

Preferred future test shape:

- `tests/flows/engagement/<module>/`
- `tests/flows/martech/<module>/`
- `tests/flows/post-sales/<module>/`

## Important Rule

If the user already gave both domain and module, do not ask again.

If the user only says something like `Lead report test case`, ask which domain it belongs to before continuing.
