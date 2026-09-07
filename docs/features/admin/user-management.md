# Admin User Management

## Purpose

Admin users should be able to create automation-ready users for the platform. Each created user must have a unique email address and password, and that user must be able to log in before any assigned automated scenario starts.

## Test Scope

- Admin login prerequisite.
- Open user management from the admin area. The automation currently tries these routes first: `/admin/developer/users`, `/admin/developer/user-management`, `/admin/developer/settings/users`, and `/admin/developer/cpms/users`.
- Create a user with email address, password, role, status, and project access.
- Verify the user appears in the user list.
- Verify the newly created user can log in.
- Verify the user has access only to the configured project/module permissions.

## Credential Model

Real credentials must stay in `config/accounts.local.json`, which is intentionally local-only. Use `config/accounts.template.json` as the format reference.

Current admin login uses the existing platform OTP flow:

- Login page: `/admin/login`
- QA URL: `https://qa.sirrus.ai/admin/login`
- UAT URL: `https://uat.sirrus.ai/admin/login`
- Credential source: `mobileNumber` and `otp` in `config/accounts.local.json`

The email/password values are for the user created by admin, unless the platform later enables email/password login for admin itself.

Recommended environment shape:

```json
{
  "uat": {
    "mobileNumber": "primary-admin-mobile",
    "otp": "1234",
    "adminUser": {
      "email": "admin@example.com",
      "password": "admin-password"
    },
    "parallelUsers": [
      {
        "name": "uat-worker-1",
        "mobileNumber": "user-1-mobile",
        "otp": "1234"
      },
      {
        "name": "uat-worker-2",
        "mobileNumber": "user-2-mobile",
        "otp": "1234"
      },
      {
        "name": "uat-worker-3",
        "mobileNumber": "user-3-mobile",
        "otp": "1234"
      }
    ]
  }
}
```

If the platform enables email/password login for automation users, add `email` and `password` to each `parallelUsers` entry and update the login helper to choose email/password for those users.

## Parallel Execution Strategy

Parallel execution should use account isolation. One Playwright worker should use one configured automation user, and no two active workers should share the same user when tests create or mutate data.

For three team members:

- If they run on separate laptops, each laptop should have its own `config/accounts.local.json` user pool or a team-specific `TEST_RUN_OWNER` prefix for generated data.
- If they run from the shared dashboard/server, the runner should allocate a unique account per submitted run and worker.
- If they select different scenarios, tests can run at the same time as long as they do not share the same login account and generated lead/user data is unique.
- If they select the same scenario, the same rule applies: use different users and randomized test data. The test result folders are already separated by run id.

## Implementation Notes

- Keep `workers` equal to the number of available isolated users. For example, three workers need at least three parallel users.
- Auth storage state should be saved per environment and user, for example `playwright/.auth/uat-worker-1.json`.
- Avoid one shared `playwright/.auth/uat.json` for parallel runs because session refresh, project switching, and user-specific local storage can collide.
- Tests that create users, leads, site visits, or reports should generate unique names/emails/mobile numbers using the run id, worker index, or timestamp.

## Automation Status

- Module registered in config.
- Execution profile added as `user-management`.
- Initial Playwright user-creation spec added at `tests/flows/user-management/create-user.spec.ts`.
- Generic user-management navigation and form selectors added at `tests/support/users.ts`; confirm the final route/selectors against the live Admin > Users screen.
