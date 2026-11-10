# Phase 0 — Stabilize

Status: approved 2026-11-11 · Branch: `phase-0-stabilize`
Source: product review "Restaurant App — Product & Feature Discovery" (Claude doc), roadmap Phase 0.

## Goal

Make the existing pickup/delivery ordering flow safe to run in a real restaurant:
staff can see and move orders through a checked workflow, nobody can create
duplicate or out-of-hours orders, and the obvious security gaps are closed.

**Gate to Phase 1:** no open P0 defects, unit tests and the end-to-end checkout
test pass in CI.

## Decisions (approved)

| Decision | Choice |
| --- | --- |
| Final order status | Keep `DELIVERED` as the final status for both types, add `READY`. UI says "Completed" for pickup. No data migration. |
| Payments (Phase 1) | Cash / pay at pickup + own PromptPay QR first; gateway later behind the same `Payment` model. |
| Thai/English (Phase 1) | Locale in the URL (`/th/...`, `/en/...`). |
| Revenue | Phase 0: revenue = `DELIVERED` orders only, everywhere. Phase 1: `DELIVERED` and paid. |
| Market | Thailand: business time zone `Asia/Bangkok` (THB comes in Phase 1). |

## Already done before this phase (commit `3b908ae`)

- Delivery distance is measured from the restaurant profile's location.
- Checkout can share the browser location; a max delivery distance requires it.
- Cost/profit stripped from quote and place-order responses.

## Database changes (one migration: `phase0_stabilize`)

- `OrderStatus` gains `READY`.
- New enum `CancelReason`: `SOLD_OUT`, `CLOSING_SOON`, `TOO_BUSY`, `OUT_OF_AREA`, `CUSTOMER_REQUEST`, `OTHER`.
- `Order` gains: `orderNumber Int?`, `businessDate String?` (YYYY-MM-DD in the business time zone,
  unique together with `orderNumber`), `idempotencyKey String? @unique`, `customerPhone String?`,
  `acceptedAt`, `estimatedReadyAt`, `readyAt`, `completedAt`, `cancelledAt` (all `DateTime?`),
  `cancelReason CancelReason?`, `cancelNote String?`, `cancelledById String?`.
  Indexes on `createdAt` and `(status, createdAt)`.
  All new columns are nullable, so existing orders stay valid.
- New `OrderStatusHistory` (orderId, fromStatus, toStatus, actorId, note, createdAt).
- New `DailyCounter` (date PK, value) for daily order numbers.
- `User` gains `isActive Boolean @default(true)` and `tokenVersion Int @default(0)`.

## Server

1. **State machine** — `modules/orders/orderStateMachine.ts` (pure, unit-tested):
   - `PENDING → PREPARING | CANCELLED`
   - `PREPARING → READY | CANCELLED`
   - `READY → OUT_FOR_DELIVERY | CANCELLED` (delivery) / `READY → DELIVERED | CANCELLED` (pickup)
   - `OUT_FOR_DELIVERY → DELIVERED | CANCELLED`
   - `DELIVERED`, `CANCELLED` are final.
   - Moving to `PREPARING` (accept) needs `prepMinutes` (1–240) → sets `acceptedAt`, `estimatedReadyAt`.
   - Moving to `CANCELLED` needs a `cancelReason` (+ optional note).
   - The update is conditional on the current status (`updateMany where status = from`), so two
     staff clicking at once cannot both win. Each move writes `OrderStatusHistory` in the same
     transaction. Invalid moves → `409`.
2. **Customer cancel** — `POST /orders/:id/cancel`: own order, only while `PENDING`, reason `CUSTOMER_REQUEST`.
3. **Daily order number** — inside the checkout transaction:
   `INSERT … ON CONFLICT (date) DO UPDATE SET value = value + 1 RETURNING value` on `DailyCounter`.
4. **Idempotent checkout** — `POST /orders` takes `idempotencyKey` (UUID). Same key + same user
   returns the existing order (`200`); same key + other user → `409`.
5. **Opening hours** — `utils/businessTime.ts` (pure, unit-tested): time-zone aware "is open now",
   overnight hours (e.g. 18:00–02:00), next opening time. `placeOrder` rejects when closed
   (`409`) if the new setting `ORDERING_HOURS_ENFORCED` is `1` (default). No hours configured =
   always open. Public `GET /settings/open-status` for the storefront banner.
6. **Phone** — `customerPhone` required on `POST /orders`, saved to the order and to the user's
   profile.
7. **Admin list** — `GET /orders/admin/all?status=&date=YYYY-MM-DD&limit=`: date filtered on the
   server in the business time zone, newest first, capped (default 200).
8. **Security**
   - `helmet`; `express-rate-limit` on login (per IP + email), register and refresh;
     `trust proxy` for the Next.js rewrite.
   - JWT carries `tokenVersion`; `authenticate` loads the user (one indexed query) and rejects
     inactive users or old token versions, and always uses the role from the database.
   - Staff "delete" becomes deactivate (`isActive=false`, `tokenVersion+1`); reactivate endpoint.
     History and audit rows keep their actor.
   - Login/refresh refuse inactive users.
   - Zod schema on `PUT /menu/:id`; boolean form fields parsed correctly (`"false"` is false).
   - Seed refuses to run with `NODE_ENV=production` unless `ALLOW_SEED=1`; passwords can come from env.
9. **Cost price** — staff cannot send `costPrice` (ignored); staff-created items get cost `0`
   ("cost missing" for the owner); menu write responses strip cost for staff.
10. **Revenue** — finance dashboard and transaction history count `DELIVERED` orders only.
11. **Cleanup** — finance uses the shared Prisma client; remove `requireAdmin.ts`, `client-old/`,
    tracked `.fuse_hidden*` files (and ignore them).

## Client

1. Types + `OrderStatusBadge`: `READY`, "Completed" label for picked-up orders, order number helper (`#042`).
2. **Admin orders page**: server-side day filter (default today), expandable rows (items, phone,
   address + map link, cancel reason, history), buttons per allowed next status, Accept dialog
   (prep minutes), Reject/Cancel dialog (reason + note), new-order sound and `(n)` count in the
   tab title.
3. **Checkout**: phone field (prefilled from profile), one idempotency key per attempt, button
   disabled while submitting, "closed" banner + disabled button when closed.
4. **Menu page**: "closed, opens …" banner.
5. **Customer orders**: order number, ETA, cancel reason, Cancel button while `PENDING`.
6. **Settings**: Deactivate / Reactivate staff instead of Delete; toggle "Only accept orders
   during opening hours".

## Tests and CI

- Unit (Vitest): state machine, business time / opening hours, order service (order number,
  idempotency, phone, closed shop), status transitions.
- End-to-end (Playwright, `e2e/`): customer places a pickup order → staff accepts → ready →
  completed → customer sees "Completed".
- GitHub Actions `ci.yml`: server type-check + unit tests, client build, E2E against a Postgres
  service.

## Out of scope (Phase 1)

Payments, item options/notes, map pin and saved addresses, busy mode, THB/Thai, KDS and live push.

## Risks

- `ALTER TYPE … ADD VALUE` (READY) cannot be used in the same transaction it is added in — the
  migration only adds it.
- Opening-hours enforcement blocks late-night testing — switch it off in Settings.
- One extra DB query per authenticated request (by primary key) — negligible at this scale.
