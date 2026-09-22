# Lead Report

## Domain

- `engagement`

## Module Name

- `lead-report`

## Summary

Lead Report covers the Engagement Intelligence Lead Reports tab, including loading report widgets, applying report date filters, and exporting report output.

## Modules

- Lead Reports tab
- report date filters
- report download/export controls

## Preconditions

- user is logged in
- correct project is selected
- user can open Engagement Intelligence
- Lead Reports tab data is available in the target environment

## Test Data Plan

### Reuse Policy

- `seeded`
  Report widgets and download data are read from the target environment.

## Business Rules

- a user should be able to open the Lead Reports tab
- a user should be able to select all projects where available
- report data should remain visible after applying date filters
- report export should download a valid file

## Automation Mapping

| Case ID | Scenario | Data Mode | Expected Result | Status | Spec File |
| --- | --- | --- | --- | --- | --- |
| LREP-001 | Open Lead Reports tab | seeded | Reports page loads with configured charts/tables | Automated | `tests/flows/lead-report/LeadReport.spec.ts` |
| LREP-002 | Filter reports by date range and export report data | seeded | Report data updates and PDF download completes | Automated | `tests/flows/lead-report/LeadReport.spec.ts` |
