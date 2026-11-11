# Username login (approved 2026-11-11)

## Goal

Everyone signs in with **username + password** instead of email + password.
Customers still give an email when they register.

## Decisions

- Login: username + password for every role. Email login is removed.
- Register (customers): name, username, email (required, unique), password.
- Staff created by an admin: username required, email optional.
- Seeded accounts (local development only, seed still refuses to run in production):
  - `superadmin` / `superadmin123`, role `SUPER_ADMIN` (override: `SEED_SUPERADMIN_PASSWORD`)
  - `admin` / `superadmin123`, role `SUPER_ADMIN` (override: `SEED_ADMIN_PASSWORD`)
  - No seeded staff account.
- Usernames: 3–32 characters, `a-z 0-9 . _ -`, stored lowercase.

## Approach

### Database
New migration:
1. Add `username` (nullable at first).
2. Backfill existing users from the part of the email before `@`: lowercased, characters
   outside `a-z 0-9 . _ -` removed, padded if shorter than 3, number suffix on clashes.
3. Make `username` `NOT NULL` + unique.
4. Make `email` nullable (still unique; Postgres allows many NULLs).

The migration only adds and relaxes, so existing databases (including the other PC) keep
their data. Existing users sign in with their generated username.

### API (server)
- `auth.routes.ts`: login schema `{ username, password }`; register schema adds `username`.
- `auth.controller.ts` / `auth.service.ts`: register checks username and email are free;
  login looks the user up by lowercase username.
- `app.ts`: login rate limiter keyed by IP + username.
- `staff.routes.ts`: create takes `username` (required) and `email` (optional); selects include `username`.
- `auditLog.routes.ts`, `orders.service.ts`: include `username` where user details are selected.

### Client
- `client/app/login/page.tsx`: username text field.
- `client/app/register/page.tsx`: add username field (email stays).
- `client/app/admin/settings/page.tsx`: staff form gets username, email optional; table shows username.
- `client/src/api/apiSlice.ts`: types gain `username`, `email: string | null`.

### Seed, scripts, docs
- `server/prisma/seed.ts`: seed `superadmin` and `admin` as above; remove the staff account.
- `start.bat`, `README.md`: list the new sample logins with a "change before going live" warning.

### Tests
- `e2e/tests/order-flow.spec.ts`: sign in by username; register fills in a username;
  staff tests create a temporary staff user through the admin staff API.
- Run the server vitest suite and the e2e suite.

### This PC's database
After migrating, delete the sample `staff@restaurant.com` row (sample data seeded on 2026-11-11).

## Risks

- Anything that posts `{ email }` to the login endpoint breaks (only the e2e tests found).
- Screens that show `email` must handle `null` for staff without an email.
- Users from the other PC's database must use their generated username.
- Sample passwords are public; change them before the app is reachable from other devices.
