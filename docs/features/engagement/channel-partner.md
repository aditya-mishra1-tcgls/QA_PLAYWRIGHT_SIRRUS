# Channel Partner

## Domain

- `engagement`

## Module Name

- `channel-partner`

## Summary

Channel Partner covers CP listing visibility across all, unregistered, and registered CP tabs.

## Preconditions

- user is logged in
- correct project is selected
- auth state is already available through Playwright setup
- Channel Partner entry point is visible from the configured project landing page

## Test Data Plan

### Dynamic Data

- CP tab counts shown beside tab titles
- visible CP listing records

### Fixed Data

- project comes from active environment config

## Validations

- Channel Partner listing page renders
- All CP tab is visible by default
- CP list is visible on All CP
- CP list is visible on Unregistered tab
- CP list is visible on Registered tab

## Automation Mapping

| Case ID | Scenario | Data Mode | Expected Result | Status | Spec File |
| --- | --- | --- | --- | --- | --- |
| CP-001 | Render All, Unregistered, and Registered CP lists | seeded | CP listing page and each tab's list render successfully | Automated | `tests/flows/channel-partner/cp-listing.spec.ts` |
