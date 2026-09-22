# Dashboard Report

## Domain

- `engagement`

## Module Name

- `dashboard-report`

## Summary

Dashboard Report covers report dashboard setup for engagement users, including creating a dashboard, attaching chart access, and saving a chart into the newly created dashboard.
The automated flow deletes the generated dashboard after validating chart creation so test data does not accumulate.

## Modules

- `Reports Dashboard`
- create dashboard modal
- create chart modal
- dashboard listing
- chart preview and saved chart view

## Preconditions

- user is logged in
- correct project is selected
- user can open `Reports Dashboard` from the engagement landing page
- report module dropdown data is available in the target environment

## Test Data Plan

### Dynamic Data

- dashboard name with random 4-digit suffix
- chart name with random 4-digit suffix
- generated dashboard is deleted during cleanup

### Fixed Data

- module: `Lead Management`
- sub module: `Leads`
- date type: `Created At`
- date range: `Last 30 Days`
- chart type: `Line`
- measure: `Count of Leads`
- dimension: `Source`

### Reuse Policy

- `fresh`
  Dashboard and chart should be created in the same test run with unique names.

## Business Rules

- a user should be able to open `Reports Dashboard`
- a user should be able to create a new dashboard with a unique name
- dashboard name should be unique enough to avoid collisions across runs
- a user should be able to create a chart and attach it to the dashboard created in the same run
- chart preview should generate before final save
- a generated automation dashboard should be deletable after the chart is saved

## Validations

- `Create New` action is visible without relying on positional selectors
- dashboard success confirmation is shown after save
- chart success confirmation is shown after save
- saved page contains the new dashboard name
- saved page contains the new chart name
- saved chart area shows a `Last Updated` label without hard-coded calendar text
- dashboard deletion success confirmation is shown
- deleted dashboard is no longer visible in the dashboard list

## Edge Cases

- dropdown options render late and require scroll
- report search may contain similarly named dashboards, so exact created name should be selected
- list ordering may change, so no positional `nth()` selectors should be used

## Automation Mapping

| Case ID | Scenario | Data Mode | Expected Result | Status | Spec File |
| --- | --- | --- | --- | --- | --- |
| DREP-001 | Create dashboard and chart from Reports Dashboard, then delete generated dashboard | fresh | Dashboard and chart save successfully, deletion succeeds, and dashboard is removed from the list | Automated | `tests/flows/dashboard-report/create-dashboard-and-chart.spec.ts` |
