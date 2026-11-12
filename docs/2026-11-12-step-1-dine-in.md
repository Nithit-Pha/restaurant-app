# Step 1 — Dine-in + kitchen display page

Status: approved 2026-11-12 · Branch: `step-1-dine-in` (from `main` after Phase 1 and UI redesign are merged)
Source: [ideas-dine-in-kitchen-stock.md](ideas-dine-in-kitchen-stock.md), Step 1.

## Goal

Guests scan the QR code on their table and order without an account (as many
times as they like during the visit). Staff confirm the table, the kitchen
cooks from its own page, waiters see every table live on a floor map, and the
bill is paid at the counter with a PromptPay QR or cash. Paying resets the
table for the next guests. Only the Super Admin can draw the floor plan.

## Before starting

Merge `phase-1-real-orders` (1d item options, 1e map + addresses, 1f Thai/English)
and `ui-redesign` (slice 6, accessibility) into `main`, then branch
`step-1-dine-in`.

## Decisions (approved)

| Decision | Choice |
| --- | --- |
| D1 Orders per visit | Every "send to kitchen" is its **own order**, all linked to the table's visit (`TableSession`). The bill adds up all rounds. |
| D2 Guest orders | No user account: `Order.userId` becomes optional and the order links to the visit; the guest's browser keeps a key that works for that visit only. |
| D3 Live stream login | Server-Sent Events opened with a normal `fetch` request that sends the usual `Authorization: Bearer` token (own ~40-line reader with reconnect, no new library). Guests poll every 10 s instead. |
| D4 Kitchen status | Per order (ticket): new → cooking → ready → served. A guest who orders several times gets one ticket per round. Per-dish status later. |
| Earlier decisions | Grid SVG editor; fixed QR sticker per table, new visit after payment; first order of a visit waits for staff; pay at the counter (PromptPay QR or cash); kitchen uses the normal Staff account; only Super Admin edits the layout; one restaurant only. |
| Way of working | One slice at a time: code + tests + commit, report, wait for OK before the next. |

## Slices (in this order)

### 1a — Floor plan editor (L)
- DB: `FloorZone` (name, sortOrder, width, height, decor JSON), `DiningTable`
  (zoneId, label, shape ROUND/SQUARE/RECT, seats, x, y, width, height, rotation,
  qrToken unique, isActive, status).
- Server: new module `server/src/modules/tables/` - list zones with tables
  (Staff+), create/update/delete zones and tables and save a whole zone layout
  at once (Super Admin only), validation (inside the zone, valid sizes, unique
  labels), audit log entries.
- Client: `/admin/tables` (Super Admin) - SVG grid editor: snap to grid, drag,
  rotate, resize; zone tabs; label and seats; decor shapes (wall, bar,
  entrance); starter templates; undo / save / reset to last saved. Sidebar link
  for Super Admin.

### 1b — Table QR codes + guest ordering (L)
- DB: `OrderType` adds `DINE_IN`; `TableSession` (tableId, guests, openedAt,
  closedAt, confirmed, confirmedById, guestKey); `Order.tableSessionId?`;
  `Order.userId` optional (D2).
- Server: `GET /tables/qr/:qrToken` finds the table's open visit or opens a new
  one and returns a visit key for the guest's browser; guest order routes use
  that key (no account) and the same pricing / option checks as today; orders of
  an unconfirmed visit wait for staff; `POST /sessions/:id/confirm` (Staff).
  Every place that reads `order.user` handles "no customer".
- Client: guest page `/t/[qrToken]` (reuses menu, options dialog and cart in
  table mode; "Call staff", "Request bill"; the visit's orders and their status).
  Print page with all QR codes (one per table with its label) using the existing
  `qrcode` package; "New QR code" per table (Super Admin).

### 1c — Live stream + floor view (L)
- Server: `GET /api/events` (Staff+) Server-Sent Events: table status, new
  orders, ticket changes, call-staff / bill requests. In-process event bus;
  headers to stop buffering (`Cache-Control: no-cache, no-transform`,
  `X-Accel-Buffering: no`), heartbeat every 25 s.
- Client: small `useEventStream` hook (fetch + reader + reconnect + token
  refresh). `/admin/floor` (Staff): floor plan coloured by table status
  (free · seated · ordered · served · bill requested · needs cleaning); tap a
  table for guests, time seated, current bill, items still in the kitchen;
  actions: confirm / seat guests, move to another table, merge tables, mark
  cleaned.
- Staff orders page switches from 15 s polling to the stream, polling stays as
  fallback when the stream is down.

### 1d — Kitchen page (M)
- Client: `/kitchen` (Staff): one ticket per order (dine-in shows the table
  label; pickup and delivery too) with options and notes; big buttons: accept
  with quick 10 / 15 / 20 min, ready, served; ticket timer turns orange, then
  red; sound for new tickets (same unlock as the staff orders page).
- Server: order workflow for `DINE_IN`: `PENDING → PREPARING → READY → DELIVERED`
  (UI: "Served"); unit tests in `orderStateMachine.test.ts`.

### 1e — Bill + payment at the counter (M)
- Server: bill for a visit = all its orders except cancelled ones;
  PromptPay payload for the bill total (existing `promptpay.ts`);
  `POST /sessions/:id/pay` (Staff, method CASH or PROMPTPAY) marks all the
  visit's orders paid in one transaction (one `Payment` row per order), closes
  the visit, sets the table to "needs cleaning", writes the audit log. If dishes
  are not served yet: 409 with a list, or `markServed: true` to serve and close.
- Client: bill view from the floor view (rounds, totals, tax); "Create payment
  QR" on screen or printed slip; "Paid" (QR / cash).
- Finance: existing rule (counted when `DELIVERED` and `PAID`) also covers
  dine-in - checked with tests.

### 1f — Final checks (S)
- Full end-to-end test, all new text in `messages/en.json` and `messages/th.json`,
  tablet-width check of floor and kitchen pages, docs updated.

## Tests

- Unit (Vitest): visit open/close and QR lookup; "first order waits" rule; bill
  totals; dine-in workflow; layout validation; move and merge; pay closes the
  visit and the next scan opens a new one.
- End-to-end (Playwright): guest scans a table and orders twice → staff confirm
  → kitchen accepts, ready, served → bill → mark paid → next scan opens an empty
  order.
- Vitest and e2e after every slice.

## Risks

- Optional `Order.userId` touches every page that shows the customer name
  (staff orders, finance, audit log, my orders) - search all uses, add tests.
- The stream goes through the Next.js `/api` rewrite, which can buffer: headers
  above + check in production mode; fallback: the browser connects to the API
  origin directly for `/api/events`.
- Fixed QR stickers: a photo of the code still works; staff confirming the first
  order of each visit stops pranks.
- One stream connection per staff device: fine for one restaurant.
- Tax per round (D1) can differ by a satang from taxing the whole bill.
