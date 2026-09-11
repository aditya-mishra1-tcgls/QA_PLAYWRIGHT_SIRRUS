# Channel Partner Creation Process

Use this reference before writing or changing Channel Partner creation tests.

## Current Spec And Helper

- Spec: `tests/flows/channel-partner/01-cp-creation.spec.ts`
- Helper: `tests/support/channel-partners.ts`
- Primary helper APIs:
  - `createChannelPartner(page, app)`
  - `buildChannelPartnerSeed(app)`
  - `assertChannelPartnerCreated(page, seed)`
  - `goToChannelPartnerListing(page, app)`

## Auth And Navigation

- Do not put login steps inside the CP creation spec.
- Use the shared `test` fixture from `tests/support/test.ts`.
- The Playwright setup project runs `tests/setup/auth.setup.ts` and saves auth state under `playwright/.auth/<env>.json`.
- Use relative app routes. Do not hardcode `https://uat.sirrus.ai` or `https://qa.sirrus.ai`.
- Open CP through `goToChannelPartnerListing(page, app)`, which:
  - goes to `/admin/developer/cpms/manage-construction`
  - ensures `app.activeProjectName` is selected
  - clicks the Channel Partner entry point
  - waits until the CP listing tabs are visible

## Data Rules

- Legal entity/company name must be generated as `Automation CP ######`.
- The `######` suffix is exactly 6 alphanumeric characters using uppercase letters and digits.
- Contact person name should not use digits. The app strips digits from this field.
- Generate contact as `Automation Head AAAAAA`, where `AAAAAA` is 6 uppercase letters.
- Email should be unique per run, for example `automation.cp+<env>-<suffix>@test.com`.
- WhatsApp/mobile number must be random 10 digits and should start with `6`, `7`, `8`, or `9`.
- Entity type default is `One Person Company (OPC)`.
- The required special-character custom dropdown default option is `!@#$%^&*`; after selection the UI may display `123!@#$%^&*`.
- Keep configurable defaults in environment variables if needed:
  - `AUTOMATION_CP_EMAIL_DOMAIN`
  - `AUTOMATION_CP_ENTITY_TYPE`
  - `AUTOMATION_CP_SPECIAL_CHAR_DROPDOWN`

## Required Form Fields Seen In UAT

Fill these minimum required fields:

- `Legal Entity *`: generated `Automation CP ######`
- `Entity Type`: `One Person Company (OPC)`
- `Contact Person Name *`: generated letters-only contact name
- `Email ID *`: unique automation email
- `Mobile Number *`: random 10-digit mobile
- `Assigned To *`: defaults to the logged-in user in the UI, usually already selected
- `dropdown special char *`: select the configured special-character option

The form also shows these fields, but they are not part of the minimum creation path unless future validation changes:

- RERA
- GST
- CIN
- Registered Address
- Location/City
- Zone
- Pincode
- State
- Source
- Sub-Source
- Alternate Number
- Text/Paragraph/Numeric/custom dropdown fields
- Category
- Projects
- `dropdownspecialchar3343`

## Selector And Interaction Rules

- Prefer role, label, id, or visible business text. Do not keep raw codegen selectors such as `div:nth-child(...)`.
- The Channel Partner form uses custom label markup, so normal `getByLabel()` may not bind to every input.
- `#companyName`, `#fullName`, `#email`, and `#whatsAppNumber` exist in the DOM, but `#fullName` needed user-like typing in live runs.
- For Contact Person Name, use a helper that finds the input near the visible `Contact Person Name` label and types with `pressSequentially()`.
- For dropdowns:
  - click the visible trigger
  - wait for the option to become visible
  - match options by visible text with a regex escaped from the configured option
  - scope label-relative dropdowns to the target label when possible
- Add an explicit wait after clicking `Add Channel Partner` until the company field is visible.
- Submit with the visible `SAVE` button or a generic save/create/submit fallback.

## Save And Redirect Behavior

- After save, the app can redirect to:
  - `/admin/developer/channel-partners/channel-partner-qualification`
- Do not assert that the page remains on `/admin/developer/cpms/manage-construction` immediately after save.
- Treat creation as successful when either:
  - a success message such as `Channel Partner added` appears, or
  - the creation form closes / redirects away from the form
- Then navigate back to the CP listing before performing search verification.

## Post-Create Verification

- Always verify the created CP through listing search after creation.
- Open the CP listing again with `goToChannelPartnerListing(page, app)`.
- Search from `All CP`, not `Unregistered`.
- Reason: newly created records may not appear under `Unregistered` immediately, and in one live run `Unregistered` showed `0` while `All CP` search had the created record.
- Search by generated Contact Person Name, not legal entity/company name.
- Reason: the listing truncates visible legal entity text, for example `Automation CP F...`, so exact company-name text assertions are flaky.
- After search:
  - fail if the no-results state appears
  - pass when at least one CP qualification link is visible, using `a[href*="/channel-partners/channel-partner-qualification"]`

## Flow Ordering

- `channel-partner` should run before lead flows when later lead tests depend on a CP existing.
- Keep `channel-partner` in:
  - `config/flows.json`
  - `config/execution-profiles.json`
  - `config/test-modules.json`
- Name creation specs so they run before listing/dependent specs inside the folder, for example `01-cp-creation.spec.ts`.

## Verification Commands

Use these checks after changes:

```bash
npx playwright test tests/flows/channel-partner/01-cp-creation.spec.ts --project=chromium --list
npx playwright test tests/flows/channel-partner/01-cp-creation.spec.ts --project=chromium
```

In the Codex sandbox on macOS, Playwright browser launch may require escalation because Chromium can fail with a MachPort permission error.
