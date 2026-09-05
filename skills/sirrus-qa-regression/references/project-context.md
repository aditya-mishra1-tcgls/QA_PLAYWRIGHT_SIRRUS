# Project Context

## Environment

- Supported environments: `qa`, `uat`
- Current default environment: read from `.env`
- Base URLs are stored in `config/environments.json`
- Accounts and OTP values are stored in `config/accounts.local.json`
- Use the shared env loader and `app` fixture instead of hardcoding env values in specs

## Project selection

- Keep project selection config-driven.
- Use the active project from environment/config helpers.
- Do not hardcode project names inside specs.
- If one environment needs a different project, reflect it through config and shared helpers first.

## Current login model

- Login path uses mobile OTP flow
- Mobile number and OTP come from config, not specs
- Setup auth is persisted and reused across normal tests

## Lead creation defaults

- Config source: `tests/data/lead-flow.json`
- Project name is config-driven and should stay explicit
- Current preferred source order should come from config data per environment
- Source category default: `Test`

## Dependent form behavior

- `Project Name` selection must settle before `Source`
- `Source` selection must settle before `Sub Source`
- Prefer waiting for selected text plus dependent control readiness rather than only fixed sleeps

## Stable authoring reminders

- Prefer role-, label-, and business-text-based locators.
- Prefer assertions on saved outcome instead of only UI interaction.
- Avoid CSS classes and positional selectors unless no stable alternative exists.
- Keep feature documentation in `docs/features/` updated when behavior or coverage changes.

## Known site-visit references as of Wednesday, August 26, 2026

- Scheduled lead: `L0826005635`
- Completed lead: `L0826005612`
- Revisit-history lead: `L0826005637`
