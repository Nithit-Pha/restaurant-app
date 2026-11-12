# Delete a staff account

Status: approved 2026-11-12 (option A) · Branch: `main`

## Goal

The owner can delete a staff or owner account from **Settings → Staff accounts**.

## Facts checked (2026-11-12)

- Accounts were only deactivated, never deleted, so history keeps its author.
- Every sign-in writes an audit-log entry, and `AuditLog.actor` is a required
  relation without `onDelete` (Restrict). Anyone who ever signed in therefore
  cannot be removed from the database without changing the audit log.

## Decision (option A)

"Delete" removes the person, not the history:

- **Account never used** (no orders, audit entries, status changes, payments,
  table confirmations, stock moves, expenses or purchase orders): the row is
  deleted (saved addresses go with it).
- **Account with history**: the personal data is wiped. Name → "Deleted user",
  username → `deleted:<id>` (a value the username rules never allow, so nobody
  can take or sign in with it), email, phone and address cleared, saved
  addresses deleted, password replaced with a random hash, signed out
  everywhere. History shows "Deleted user".
- Deleted accounts are hidden from the staff list.

Rules: owner only; only an account that is already deactivated (so the last
active owner can never be deleted, and nobody can delete themselves); the
dialog asks for the username; the delete is written to the audit log without
personal data. It cannot be undone.

No database change.

## Changes

- Server: `server/src/modules/auth/staff.service.ts` (`deleteStaffAccount`,
  unit-tested); `DELETE /api/admin/staff/:id` now deletes (it used to
  deactivate; the website did not use it). Staff list hides deleted accounts.
- Website: `deleteStaff` mutation; "Delete" button on deactivated rows; confirm
  dialog where the owner types the username. English and Thai text.
- e2e: create → deactivate → delete; `order-flow.spec` cleanup deactivates first.

## Known limit

Older audit entries written before the delete (for example "account created",
which stores the name, username and email) keep that data. Clearing them would
mean editing the audit log; decide separately if it is needed.
