# Test Strategy

This project should keep feature requirements and automation coverage close together.

## Goal

When we write or update a test case, we should also update the related feature spec file so the automation always matches the latest product behavior.

## Source Of Truth

Use `docs/features/*.md` for feature-level business rules.

Each feature file should describe:

- what the feature does
- who can use it
- required preconditions
- dynamic data fields
- fixed data fields
- validation rules
- allowed transitions
- edge cases
- exact test cases to automate
- known gaps or pending automation

## Folder Rule

- `domain`
  Top-level business area such as `engagement`, `martech`, or `post-sales`
- `feature`
  Module or capability inside a domain such as `lead-management`, `lead-report`, `dashboard-report`, or `site-visit`
- `tests/flows/...`
  Contains executable Playwright tests
- `tests/support/...`
  Contains reusable fixtures, helpers, and page actions
- `tests/data/...`
  Contains reusable input data
- `docs/features/...`
  Contains feature requirements and exact automation mapping
- `docs/templates/...`
  Contains templates for new feature documentation

## Working Rule

For every new feature or behavior change:

1. Update the matching file in `docs/features/`
2. Update or add the test under `tests/flows/`
3. Update helper logic in `tests/support/` only if needed
4. Mark coverage status in the feature doc

## Data Planning Rule

Do not make one spec depend on another spec.

Instead, each test should declare which state it needs:

- `fresh`
  Create a new lead for this test only
- `shared`
  Reuse one lead created once for a related workflow pack
- `seeded`
  Use a known reusable record already available in the target environment

## Naming Rule

- Top-level grouping = domain
- Next grouping = feature/module
- Spec file name = user action or behavior
- Feature doc name = business feature

Examples:

- `tests/flows/engagement/lead-management/edit-lead.spec.ts`
- `tests/flows/engagement/site-visit/site-visit-flow.spec.ts`
- `docs/features/engagement/lead-management.md`
- `docs/features/engagement/site-visit.md`
- `docs/features/martech/campaign-report.md`
- `docs/features/post-sales/customer-ticket.md`

## New Test Intake Rule

When someone says "let's write a new test case", first identify:

1. domain
2. feature or module
3. scenario

The expected first question pattern is:

- Which domain is this for: `engagement`, `martech`, or `post-sales`?
- What is the feature/module name inside that domain?

Example:

- `engagement -> lead-report`
- `engagement -> dashboard-report`
- `engagement -> lead-management`
- `martech -> campaign-dashboard`
- `post-sales -> service-request`

## Coverage Status

Every feature file should clearly tag each case as one of:

- `Automated`
- `Partially Automated`
- `Manual Only`
- `Pending`
