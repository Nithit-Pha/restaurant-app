# Step 3 — Stock ordering (raw material purchasing)

Status: **done** 2026-11-12 (slices 3a–3g, see "Built" at the end) · Branch: `main`
Source: [ideas-dine-in-kitchen-stock.md](ideas-dine-in-kitchen-stock.md), Step 3. Builds on
[Step 2 — Ingredient stock](2026-11-12-step-2-stock.md).

## Goal

Every ingredient has a supplier, a pack size and target / reorder / emergency
levels. On each supplier's order days the app prepares a **draft order** that
fills stock back up to the target; below the emergency level an **urgent
draft** is ready at once and staff see an alert. The owner ticks what goes in,
presses **Send** and gets a **PDF** to forward (LINE, email, print). When the
delivery arrives, staff enter what really came and the real price: stock goes
up and Finance gets one expense. Only the owner sends orders unless they allow
staff on **Settings → Permissions**.

## Decisions (approved 2026-11-12)

| Decision | Choice |
| --- | --- |
| D1 PDF | One-click **Download PDF**, made in the browser from the order page (Thai text always right; the PDF is a picture of the page). The order lists **all of the supplier's ingredients with a tick box**: low ones are ticked automatically with the suggested packs, the owner can tick / untick any line and change packs. Ingredients are linked to a supplier by ticking them on the supplier, or choosing the supplier on the ingredient. |
| D2 Alerts | Web alerts **on** by default; LINE and email **off** by default, switched on in Settings → Notifications (slice 3g, last). |
| D3 Finance | **One** "Food supply" expense per delivery (supplier + order number), matching the invoice. |
| D4 Draft timer | Timer inside the API server every 5 minutes, catches up after a restart, never two drafts for one supplier and order day. Per supplier "prepare the draft": **default when the restaurant closes on the day before an order day** (closing time from the opening hours), or at a set time. |
| Order amount | Fill up to the target level, rounded up to whole packs. |
| Emergency | Alert + ready urgent draft; nothing is sent automatically. |
| Suppliers | One supplier per ingredient (backup supplier later). |
| Sending | Owner only by default; Staff can be allowed on Settings → Permissions. |
| Way of working | One slice at a time: code + tests + commit, report. Only my own files are committed (another session works in this folder too). |

## Data

- `Supplier`: name (unique), contact, phone, LINE ID, email, address, note,
  isActive; order days: `frequency` (DAILY / WEEKLY / EVERY_N_DAYS / MONTHLY),
  `weekdays` (1 = Mon … 7 = Sun), `everyNDays` + `startDate`, `monthDay`;
  `draftTime` (null = when the restaurant closes the day before), `cutOffTime`,
  `leadTimeDays`, `minOrder`.
- `Ingredient` + `supplierId`, `packName` ("sack"), `packSize` (in the
  ingredient's unit, default 1), `targetLevel`, `emergencyLevel`,
  `lastPackPrice`. `reorderLevel` (Step 2) stays: at or below it the ingredient
  goes on the next order.
- `PurchaseOrder`: number (PO-0001), supplier, status (DRAFT / SENT /
  PARTLY_RECEIVED / RECEIVED / CANCELLED), source (MANUAL / SCHEDULED /
  EMERGENCY), `orderDay` (unique with supplier for scheduled drafts), expected
  date, note, sent / received by and at, expense.
- `PurchaseOrderItem`: ingredient, packs, copies of pack name / size / unit,
  received amount, real pack price.
- `StockMovement.purchaseOrderId` for deliveries; `Expense.purchaseOrderId`.
- Permissions and notification settings in the existing `Setting` table.

## Slices

### 3a — Suppliers and ordering settings (M)
- DB: `Supplier`, ingredient ordering fields.
- Server `server/src/modules/suppliers/`: list / create / update / switch off
  (owner); assign ingredients by ticking them; order-day rules as pure
  functions (`orderDays.ts`, unit-tested); pure "packs to order" (fill to target).
- Client: **Suppliers** page (owner); ingredient dialog gets supplier, pack,
  target and emergency level; stock page shows supplier and "order N packs".

### 3b — Purchase orders by hand (L)
- **Purchase orders** page (drafts / sent / received); new order for a supplier
  lists all its ingredients with tick boxes (low ones ticked with suggested
  packs); edit, cancel; **Send** = mark sent + download PDF (restaurant,
  supplier, date, number, packs and amounts, delivery date, note).

### 3c — Order days and emergency drafts (M)
- 5-minute timer creates the scheduled drafts (D4); emergency level after an
  order, count or waste creates or updates one urgent draft per supplier; live
  events.

### 3d — Receiving deliveries (M)
- Receive: tick lines, amount received, real price → stock in (linked to the
  order), last price, one Finance expense, status Partly received / Received.

### 3e — Settings → Permissions (S)
- On/off per role: send orders (Staff off), edit suppliers and levels (off),
  receive deliveries (on), count / waste (on); server checks; audit log.

### 3f — Alert bell (S)
- Bell in the top bar: emergency stock, drafts waiting to be sent, deliveries
  due today; worked out from the current state.

### 3g — LINE and email (M)
- Settings → Notifications: web on, LINE and email off by default; which alerts
  go out; "Send test".

## Tests

- Unit: packs (fill to target), order-day rules (every N days, the 31st in short
  months, Bangkok dates, draft time = closing time the day before), emergency
  detection, one draft per supplier and day, partial receiving, permissions.
- End-to-end: supplier + ingredient → used up → urgent draft → send (PDF) →
  receive part → stock and Finance expense right; staff cannot send until allowed.

## Risks

- The timer only runs while the app runs; catching up at start covers a PC that
  was off.
- The PDF is a picture (not searchable): fine for suppliers.
- Another session works in this folder: Step 3 lives in its own files
  (`suppliers/`, `purchasing/`), shared files only get small hooks.

## Built (2026-11-12)

| Slice | Commit | Notes |
| --- | --- | --- |
| 3a Suppliers and ordering settings | d838527 | Pure rules in `suppliers/ordering.ts` (not `orderDays.ts`). |
| 3b Purchase orders by hand + PDF | f4df130 | PDF drawn on a canvas with the app's fonts and wrapped by a small PDF writer (no new package). File name keeps only the Latin part of the supplier name (browsers may drop Thai file names). |
| 3c Order-day and urgent drafts | 6c67c83 | Each order day checked once (`OrderDayCheck`): removed lines stay removed; an open draft gets the missing lines instead of a second draft; nothing low = no empty draft; closed the day before = 18:00. Urgent once per drop (`Ingredient.urgentSince`). Suggestions leave out ingredients already on a sent order. |
| 3d Receiving deliveries | dda505a | Prices stay owner-only (chosen 2026-11-12): staff deliveries show "Price missing" until the owner adds line prices → one Food supply expense per delivery, dated on the delivery day. "Nothing more coming" closes a partly received order. Purchase orders moved to the Service menu. |
| 3e Settings → Permissions | f07e6cd | Five switches for Staff (orders, suppliers/ingredients, receive, stock moves, prices). |
| 3f Alert bell | 1ee776a | Worked out from the current state; each person sees only what they may act on. |
| 3g LINE and email | a3cae69 | LINE Messaging API (LINE Notify ended 2025). Email through a small built-in SMTP client (SSL 465 / STARTTLS 587), so `start.bat` needs no new `npm install`. Deliveries due: one message a day after 08:00. |

Not done here: the end-to-end Playwright test from "Tests" above (unit tests and
browser checks against a stand-in API were run for every slice; the server
automation and receiving were tested with an in-memory database).
