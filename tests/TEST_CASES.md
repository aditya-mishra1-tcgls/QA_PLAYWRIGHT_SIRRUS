# TCGLS QA Flow Catalog

Single execution command:

```bash
npm run test:flows
```

Default sequential order is controlled in `config/flows.json`.

## Current implemented flows

1. `smoke`
2. `auth`
3. `lead-management`
   Includes:
   Lead creation
   Lead edit

## Designed next flows

1. Site visit stage lifecycle
2. Lead search and filter validation
3. Lead stage movement from New Lead to Open/Site Visit
4. Lead assignment and owner update
5. Lead detail update and required field validation
6. Lead reports validation
7. Bulk lead upload
8. Engagement dashboard metric sanity checks
9. Call and chat CTA availability checks
10. Logout and session persistence checks

## Lead creation rules

1. Open `Engagement Intelligence` from the second left-rail icon after login.
2. Open `Manage Leads`.
3. Click `Add Lead`.
4. Use generated seed data:
   Full Name: `Automation Lead ####`
   WhatsApp: random 10-digit number
   Project: first available project
   Source: preferred first match from `Direct Site Visit`, `Digital Marketing`, `Channel Partner`
   Sub Source: first available option after source selection
   Source category: `Test`
5. Fill optional helper fields when visible:
   Company Name
   Preferred Location
   Other Preferences
6. Save and verify the new lead appears in listing search.

## Lead edit rules

1. Open `Engagement Intelligence` from the second left-rail icon after login.
2. Open `Manage Leads`.
3. Select any available lead from the listing.
4. Click `Edit Lead`.
5. Update the lead name with `Edited Prefix`.
6. Save and verify the updated name is visible on the lead profile.

## Site visit lifecycle rules

1. A user should be able to book a site visit from any earlier stage.
2. Once the lead is in `Site Visit`, the sub-stage path should support:
   `Scheduled`
   `In Progress`
   `Channelled`
   `No Show`
   `Visit Done`
   `Revisit`
3. Site visit completion should support both verification paths:
   OTP path with hard-coded OTP `1234`
   Skip OTP path
4. After site visit completion, the lead should move to `Opportunity` with:
   remark
   next follow-up date
   save

## Site visit cases

1. Verify a scheduled site visit lead exposes site-visit stage controls.
2. Verify a scheduled site visit can move to `In Progress`.
3. Verify an in-progress site visit can be completed with OTP `1234`.
4. Verify an in-progress site visit can be completed through skip OTP.
5. Verify a scheduled or in-progress site visit can be marked `No Show`.
6. Verify a completed site visit shows start, end, and total duration.
7. Verify revisit history is preserved on repeated site visits.
8. Verify a completed site visit can move to `Opportunity` with remark and next follow-up date.
