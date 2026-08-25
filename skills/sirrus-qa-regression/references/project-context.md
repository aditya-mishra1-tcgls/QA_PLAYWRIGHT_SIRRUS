# Project Context

## Environment

- Current default environment: `uat`
- Base URLs are stored in `config/environments.json`
- Accounts and OTP values are stored in `config/accounts.local.json`

## Current UAT login

- Login path uses mobile OTP flow
- Mobile number currently used in automation: `9456888501`
- OTP currently used in automation: `1234`

## Lead creation defaults

- Config source: `tests/data/lead-flow.json`
- Project name is config-driven and should stay explicit
- Current UAT project name: `Sapphire Residency`
- Current preferred source order for UAT: `Channel Partner`, `Direct Site Visit`, `Digital Marketing`
- Source category default: `Test`

## Dependent form behavior

- `Project Name` selection must settle before `Source`
- `Source` selection must settle before `Sub Source`
- Prefer waiting for selected text plus dependent control readiness rather than only fixed sleeps

## Known UAT site-visit references on Monday, August 24, 2026

- Scheduled lead: `L0826005635`
- Completed lead: `L0826005612`
- Revisit-history lead: `L0826005637`
