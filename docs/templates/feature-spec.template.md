# <Feature Name>

## Domain

- `engagement` or `martech` or `post-sales`

## Module Name

- exact module/feature name

## Summary

Short description of the feature and why it exists.

## Modules

- main module or menu path
- child screens if applicable

## Preconditions

- required login state
- required project selection
- required record state
- env restrictions if any

## Test Data Plan

### Dynamic Data

- fields that should be generated at runtime
- examples: lead name, phone number, current date, remark text

### Fixed Data

- fields that can stay constant
- examples: OTP `1234`, source category `Test`, project `Test1303`

### Reuse Policy

- `fresh`
  When this feature needs a new record every run
- `shared`
  When related test cases can reuse one created record
- `seeded`
  When the feature needs a known existing record in a specific state

## Business Rules

- exact behavior rule 1
- exact behavior rule 2
- exact behavior rule 3

## Transitions

- allowed stage changes
- blocked stage changes
- required remarks, dates, or confirmations

## Validations

- required fields
- success messages
- expected UI state
- backend or listing changes visible after save

## Edge Cases

- empty field behavior
- duplicate data behavior
- hidden/disabled actions
- permission-specific differences

## Automation Mapping

| Case ID | Scenario | Data Mode | Expected Result | Status | Spec File |
| --- | --- | --- | --- | --- | --- |
| FEAT-001 | Example scenario | fresh | Example result | Pending | `tests/flows/...` |

## Pending Questions

- open product question 1
- open QA question 2

## Notes

- anything important for future automation updates
