# Page Object Model

This framework now separates object repositories from business flow helpers.

## Folder Roles

- `tests/pages`
  Page Object classes. Keep stable locators and low-level page actions here.
- `tests/support`
  Fixtures, environment loading, reusable cross-page utilities, and backward-compatible flow helpers.
- `tests/flows`
  Specs that describe business journeys in readable steps.
- `tests/data`
  Test data and environment-specific seed data.

## Current Page Objects

- `LoginPage`
  Login page locators and OTP login actions.
- `ProjectSwitcherPage`
  Active project detection and project switching.
- `ChannelPartnerPage`
  Channel Partner listing navigation, tab selection, and listing assertions.
- `LeadListPage`
  Manage Leads navigation, lead search, and opening lead profiles.
- `LeadFormPage`
  Lead form locators and modal save behavior.
- `LeadProfilePage`
  Lead profile readiness, edit lead, remarks, comments, re-enquiry, cost sheet, stage, and journey entry points.
- `ReportsPage`
  Lead report dashboard navigation.
- `SiteVisitPage`
  Seeded site-visit lead detail navigation and site-visit assertions.
- `UserManagementPage`
  User management navigation and user listing verification.

## Authoring Rule

For new automation:

1. Add page-specific locators and page actions to `tests/pages`.
2. Put reusable cross-page interactions in `tests/support/ui-actions.ts`.
3. Keep test specs focused on business intent.
4. Preserve existing helper exports when refactoring so older specs keep working.

Example:

```ts
import { LeadListPage } from "../../pages";

test("Open an existing lead", async ({ page, app }) => {
  const leadList = new LeadListPage(page);

  await leadList.openManageLeads(app);
  await leadList.openLeadByName("Automation Lead ABC123");
});
```

## Migration Approach

The existing flow helpers still export the same functions used by current specs. Internally, common entry points now delegate to Page Objects. This lets the framework move toward a cleaner Page Object Model without breaking the current test suite in one large rewrite.

Current compatibility wrappers include auth, project switching, lead list navigation, lead form save, lead profile actions, Channel Partner navigation, Reports navigation, User Management navigation, and seeded Site Visit assertions.

Keep migrating the remaining large `tests/support/leads.ts` internals in small slices:

1. Move page-specific locators and actions to a Page Object.
2. Replace the old exported helper body with a one-line Page Object call.
3. Remove any private helper that has no remaining references.
4. Run `npm run typecheck` and `npm test -- --list`.
