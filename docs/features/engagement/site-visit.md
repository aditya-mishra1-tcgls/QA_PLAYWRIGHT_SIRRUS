# Site Visit

## Domain

- `engagement`

## Module Name

- `site-visit`

## Summary

Site Visit covers booking, sub-stage movement, visit completion, OTP or skip verification, revisit history, and transition to Opportunity.

## Modules

- `Engagement Intelligence`
- `Manage Leads`
- lead profile stage panel
- site visit action modal

## Preconditions

- user is logged in
- correct project is selected
- lead exists and is eligible for site visit booking
- some scenarios require the lead already to be in `Scheduled`, `In Progress`, or `Visit Done`

## Test Data Plan

### Dynamic Data

- lead created for the visit flow
- visit date
- visit remark
- opportunity remark
- next follow-up date

### Fixed Data

- OTP can stay `1234` where the environment supports the hard-coded test OTP
- active project comes from environment config

### Reuse Policy

- `fresh`
  Full end-to-end booking to completion flow
- `shared`
  Related read-only validations on the same site visit workflow pack
- `seeded`
  Cases that need direct access to `Scheduled`, `In Progress`, `No Show`, or `Visit Done` without replaying the full path

## Business Rules

- a user should be able to book a site visit from an earlier lead stage
- site visit should support sub-stages such as `Scheduled`, `In Progress`, `Channelled`, `No Show`, `Visit Done`, and `Revisit`
- completion may support OTP verification or skip OTP depending on workflow
- after visit completion, the lead may move to `Opportunity` with required details

## Transitions

- early stage -> `Site Visit`
- `Scheduled` -> `In Progress`
- `In Progress` -> `Visit Done`
- `Scheduled` or `In Progress` -> `No Show`
- `Visit Done` -> `Opportunity`
- repeat flow may create `Revisit` history

## Validations

- stage controls are visible when a lead is in site visit flow
- allowed sub-stage actions appear correctly
- completion details show start time, end time, and duration
- revisit history remains visible after repeated visits
- opportunity transition requires remark and follow-up date if the product enforces them

## Edge Cases

- booking action not available from a blocked stage
- OTP modal delay or skip path differences by environment
- date picker formatting issues
- revisit history not visible after multiple transitions
- lead not found in expected stage because prior mutation failed

## Automation Mapping

| Case ID | Scenario | Data Mode | Expected Result | Status | Spec File |
| --- | --- | --- | --- | --- | --- |
| SV-001 | Scheduled site visit lead exposes stage controls | seeded | Controls visible for valid lead | Automated | `tests/flows/site-visit/site-visit-flow.spec.ts` |
| SV-002 | Completed site visit lead shows completion details | seeded | Start, end, and duration visible | Automated | `tests/flows/site-visit/site-visit-flow.spec.ts` |
| SV-003 | Site visit history shows repeated states and revisit path | seeded | History is preserved | Automated | `tests/flows/site-visit/site-visit-flow.spec.ts` |
| SV-004 | Scheduled site visit moves to In Progress | fresh or seeded | Stage updates to In Progress | Pending | `tests/flows/site-visit/site-visit-flow.spec.ts` |
| SV-005 | In Progress site visit completes with OTP | fresh or seeded | Visit completes through OTP path | Pending | `tests/flows/site-visit/site-visit-flow.spec.ts` |
| SV-006 | In Progress site visit completes through skip OTP | fresh or seeded | Visit completes through skip path | Pending | `tests/flows/site-visit/site-visit-flow.spec.ts` |
| SV-007 | Scheduled or In Progress site visit marked No Show | fresh or seeded | No Show state saved correctly | Pending | `tests/flows/site-visit/site-visit-flow.spec.ts` |
| SV-008 | Visit Done lead moves to Opportunity with remark and follow-up date | fresh or seeded | Opportunity transition completes | Pending | `tests/flows/site-visit/site-visit-flow.spec.ts` |

## Update Checklist

When Site Visit functionality changes:

1. update this file first
2. record which fields are dynamic and which are fixed
3. record the exact precondition stage needed by each scenario
4. update the mapped test case status
