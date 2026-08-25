# Flow Map

## Implemented flows

- Login baseline with saved auth state
- Lead creation flow structure
- Site visit read-only validations against current UAT staged leads

## Current single-run entry

- `npm run test:flows`
- Flow order is configured in `config/flows.json`

## Current blockers

- Fresh lead creation verification is not fully stable yet because table refresh and search timing can lag after save.
- Full mutation from newly created lead to `Site Visit -> In Progress -> Visit Done` is not implemented yet.
- OTP and skip-OTP completion paths need dedicated non-shared staging leads before safe automation.

## Site visit target cases

- Scheduled -> In Progress
- In Progress -> Visit Done via OTP `1234`
- In Progress -> Visit Done via skip OTP
- Scheduled/In Progress -> No Show
- Visit Done -> Opportunity with remark and next follow-up date

## Maintenance rule

- Whenever a new selector pattern, lead fixture, project fixture, or stage rule becomes stable, update this file and `project-context.md` in the same change.
