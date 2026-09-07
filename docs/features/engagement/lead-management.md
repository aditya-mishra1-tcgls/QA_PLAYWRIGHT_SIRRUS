# Lead Management

## Domain

- `engagement`

## Module Name

- `lead-management`

## Summary

Lead Management covers creation, search, edit, comments, remarks, re-enquiry, and stage movement from the Engagement Intelligence area.

## Modules

- `Engagement Intelligence`
- `Manage Leads`
- lead listing
- lead profile
- lead form

## Preconditions

- user is logged in
- correct project is selected
- user can open `Manage Leads`
- auth state is already available through Playwright setup

## Test Data Plan

### Dynamic Data

- lead full name
- WhatsApp number
- visible mandatory lead form fields from the runtime `lead-form` API response
- email updates during edit
- remark text
- comment text

### Fixed Data

- project defaults to active project from environment config (`Test123` on QA and `Test1303` on UAT)
- source category can stay `Test`
- source preference order can come from test data config

### Reuse Policy

- `fresh`
  Lead creation validation, duplicate checks, first-save flows
- `shared`
  Edit lead, add remark, add comment panel, non-destructive profile updates
- `seeded`
  Cases that need a very specific legacy state already present in the environment

## Business Rules

- a user should be able to create a lead from `Manage Leads`
- required fields must be filled before save, including fields made mandatory through the lead form setup
- saved lead should appear in listing search
- a user should be able to open an existing lead and update editable fields
- remarks and comments should remain visible after save or refresh if the product supports persistence
- stage movement should follow allowed business transitions only

## Validations

- lead form opens successfully
- required dropdowns populate correctly
- source and sub-source dependency works
- mandatory text, dropdown, date, time, and user picker fields are filled according to the current form configuration
- newly created lead is searchable in listing
- edited lead values appear on profile or listing
- stage changes show the updated status in UI

## Edge Cases

- no dropdown options available
- delayed dependent dropdown rendering
- truncated text in profile header
- duplicate phone number or duplicate lead conflict
- fields visible in one env but hidden in another

## Automation Mapping

| Case ID | Scenario | Data Mode | Expected Result | Status | Spec File |
| --- | --- | --- | --- | --- | --- |
| LEAD-001 | Create lead from Manage Leads | fresh | Runtime mandatory fields are filled, then the new lead is saved and searchable | Automated | `tests/flows/lead-management/lead-creation.spec.ts` |
| LEAD-002 | Edit existing lead name and email | shared | Updated values visible on profile | Automated | `tests/flows/lead-management/edit-lead.spec.ts` |
| LEAD-003 | Change stage of an opened lead | shared | Stage updates successfully | Partially Automated | `tests/flows/lead-management/lead-stage-change.spec.ts` |
| LEAD-004 | Add remark on existing lead | shared | Remark saved and visible | Automated | `tests/flows/lead-management/add-remark.spec.ts` |
| LEAD-005 | Open comment panel and add comment behavior | shared | Comment panel works correctly | Automated | `tests/flows/lead-management/add-comment-panel.spec.ts` |
| LEAD-006 | Re-enquiry flow on lead | seeded | Re-enquiry options save correctly | Automated | `tests/flows/lead-management/add-re-enquiry.spec.ts` |

## Update Checklist

When Lead Management changes:

1. update this file first
2. confirm whether data mode should stay `fresh`, `shared`, or `seeded`
3. update the relevant spec file
4. update helper logic only if selectors or workflow changed
