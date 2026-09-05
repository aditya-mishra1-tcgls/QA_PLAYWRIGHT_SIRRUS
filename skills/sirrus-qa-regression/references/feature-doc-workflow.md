# Feature Documentation Workflow

## Goal

Keep feature requirements, dynamic data rules, and test coverage aligned with the code.

## Source Of Truth

- `docs/TEST_STRATEGY.md`
- `docs/features/*.md`
- `docs/templates/feature-spec.template.md`

Feature docs should now be organized by domain:

- `docs/features/engagement/*.md`
- `docs/features/martech/*.md`
- `docs/features/post-sales/*.md`

## Required Workflow

For every new test case or feature behavior update:

1. identify the domain and module first
2. find the matching feature document in `docs/features/<domain>/`
3. create it from the template if it does not exist
4. update business rules, preconditions, dynamic data, fixed data, and validations
5. update the automation mapping table
6. then update or add the Playwright test

## What To Record

Always capture:

- feature summary
- module/menu path
- preconditions
- dynamic data
- fixed data
- allowed transitions
- validations
- edge cases
- automation status
- mapped spec file

## Examples

- lead creation should record generated lead name and phone as dynamic data
- site visit completion should record whether OTP `1234` is fixed test data
- opportunity movement should record whether remark and next follow-up date are required

## Coverage Status

Use only:

- `Automated`
- `Partially Automated`
- `Manual Only`
- `Pending`
