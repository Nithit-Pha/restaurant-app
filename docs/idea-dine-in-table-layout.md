# Idea: Custom table layout for dine-in

Status: **idea**, not approved or scheduled yet (added 2026-11-11, updated 2026-11-11)

Decisions so far:
- QR code: **option 1 chosen** (2026-11-11) - fixed QR sticker per table, new order after payment
- Live table status: **Server-Sent Events** (2026-11-11)
- Payment: **at the counter** - staff generate a QR payment and bring it to the table (2026-11-11)
- Kitchen display: **yes, a separate page** - details and options in [idea-kitchen-display.md](idea-kitchen-display.md)
- Scope: **one restaurant only for now**, branches later (2026-11-11)
- Layout editor: **option 1 - grid-based editor with plain SVG + drag** (2026-11-11)

## Goal

Each restaurant **draws its own dining room** in the admin area: where the tables
are, their shape, how many seats each has, and which zone they belong to
(e.g. "Indoor", "Terrace", "2nd floor"). Staff then use that same floor plan as a
**live view** of the restaurant, and guests can order from their table.

Today the app only knows `PICKUP` and `DELIVERY` (`OrderType` in
`server/prisma/schema.prisma`), so dine-in guests cannot be handled at all.

## What it would include

### 1. Layout editor (Super Admin)
- Add tables from a toolbar: **round, square, rectangle**; set seats (2/4/6/8…).
- Drag to move, rotate, resize; snap to a grid so it always looks tidy.
- Label each table ("T1", "A3", "VIP 1").
- Several **zones / floors** as tabs.
- Optional decor shapes: walls, bar counter, kitchen door, entrance, plants.
- **Starter templates** for low-tech owners ("8 tables for 4", "café with bar"),
  then adjust, instead of starting from an empty canvas.
- Save / undo / "reset to last saved".

### 2. Live floor view (Staff)
- Same plan, each table coloured by status:
  - free · seated · ordered · food served · bill requested · needs cleaning
- Tap a table: guests count, time seated, current bill, items still in the kitchen.
- Actions: seat guests, open order, **move** guests to another table,
  **merge** tables for a big group, close bill, mark cleaned.

### 3. QR code for each table (Guests)
Every table gets its own QR code. Scanning it opens the menu **already linked to
that table**, so the guest never types a table number.

Flow for one visit:
1. Guests sit down and scan the table's QR code → the table's **current order**
   opens (a new one is created if the table is free).
2. Everyone at the table can scan and add items to the **same table order**;
   staff see it on the live floor view and in the kitchen.
3. "Call staff" and "Request bill" buttons.
4. **After payment, the table's order is closed and the table changes over:**
   - the paid order is locked and saved to order history and finance,
   - the table goes to "needs cleaning", then "free",
   - the next scan of the same QR code starts a **brand-new, empty order**,
     so new guests never see or add to the previous guests' bill.
5. Old guests who scan again after paying (or someone with a photo of the QR)
   land on the new order, which staff must confirm first (see below).

### 4. Payment at the counter (decided)
Guests do **not** pay inside the app. Payment is handled by staff:
1. Guest taps "Request bill" (or tells the waiter) → the table turns "bill requested".
2. Staff open the table's bill at the counter and press **"Create payment QR"**.
   The app makes a **Thai PromptPay QR code with the exact amount** of the bill.
3. Staff print it (or show it on a tablet) and **bring it to the table**; cash is
   also possible.
4. When the money arrives, staff press **"Paid"** (choose QR / cash) → the order
   is locked, the table session closes and the table goes to "needs cleaning".
5. Later option: confirm payments automatically through a payment provider
   instead of staff pressing "Paid".

Also:
- No account needed for dine-in guests.
- Admin can print all QR codes at once (one per table, with the table label),
  and regenerate a table's code if a sticker is damaged or copied.

### Later (not part of the first version)
- Reservations shown on the plan, split bill by seat, waiter assignment per zone,
  table turnover statistics in the finance dashboard.

## Choice: how to build the layout editor

Chosen: **Option 1 - grid-based editor with plain SVG + drag** (2026-11-11).

| Option | Pros | Cons |
| --- | --- | --- |
| **1. Grid-based editor with plain SVG + drag (chosen)** | No extra library; snapping keeps layouts neat; easy for low-tech owners; tables are simple data (`x, y, w, h, rotation`); works on tablets | Free-form shapes are limited; rotation/resize handles must be written by hand |
| 2. Canvas library (e.g. `react-konva`) | Smooth free drag, rotate and resize out of the box; good for complex rooms | Extra dependency (~150 KB); canvas is harder to make accessible and to style with Tailwind; easier for owners to make messy layouts |
| 3. No drawing, just a list/grid of table cards | Fastest to build; nothing to learn | Doesn't show the real room, so it's not a "custom layout"; staff lose the at-a-glance view |

## Choice: how the table QR code works with "new order after payment"

Chosen: **Option 1 - fixed QR sticker per table + new order after payment** (2026-11-11).

| Option | Pros | Cons |
| --- | --- | --- |
| **1. Fixed QR sticker per table + new order after payment (chosen)** | Print once, stick on the table, done; easy for low-tech owners; paying automatically resets the table; staff confirm the first order of each visit to stop pranks | The QR code itself never changes, so a photo of it still works; it only opens the *new* order, which staff must confirm |
| 2. QR code changes after every payment (new code printed on the receipt or on a table tent) | Old photos stop working immediately; very secure | Needs a printer at each change-over; staff must swap the paper every time; easy to forget |
| 3. QR code shown on a small tablet/screen at each table, refreshed after payment | Changes automatically, nothing to print; can also show order status | Costs a device per table; charging and theft; overkill for small restaurants |

How option 1 works technically: the QR link holds the table's `qrToken`. The
server looks up the table's **open** `TableSession`; if none is open (table was
paid and closed), it creates a new one. Paying sets `closedAt` on the session,
so the next scan can never reach the old order.

## Choice: how staff get live table status

Chosen: **Option 2 - Server-Sent Events** (2026-11-11). The same event stream
also feeds the kitchen display page.

| Option | Pros | Cons |
| --- | --- | --- |
| 1. Polling every 5–10 s | Simplest; no server changes beyond normal endpoints | Short delay; extra requests |
| **2. Server-Sent Events (chosen)** | Instant updates; one-way server→browser is all we need; works through normal HTTP | Need to handle reconnects; one open connection per staff device |
| 3. WebSockets (e.g. `socket.io`) | Two-way, very flexible | New dependency and more setup than this feature needs |

## Rough data model (sketch)

```prisma
enum OrderType { PICKUP DELIVERY DINE_IN }      // add DINE_IN

enum TableShape  { ROUND SQUARE RECT }
enum TableStatus { FREE SEATED ORDERED SERVED BILL_REQUESTED CLEANING }

model FloorZone {               // "Indoor", "Terrace", ...
  id        String        @id @default(uuid())
  name      String
  sortOrder Int           @default(0)
  width     Int           // canvas size in grid units
  height    Int
  tables    DiningTable[]
  decor     Json?         // walls, bar, entrance as simple shapes
}

model DiningTable {
  id        String      @id @default(uuid())
  zone      FloorZone   @relation(fields: [zoneId], references: [id])
  zoneId    String
  label     String      // "T1"
  shape     TableShape
  seats     Int
  x         Int
  y         Int
  width     Int
  height    Int
  rotation  Int         @default(0)
  qrToken   String      @unique   // used in the QR link, can be regenerated
  isActive  Boolean     @default(true)
  status    TableStatus @default(FREE)
  sessions  TableSession[]
}

model TableSession {            // one visit: first scan/seated -> bill paid (then a new one starts)
  id         String      @id @default(uuid())
  table      DiningTable @relation(fields: [tableId], references: [id])
  tableId    String
  guests     Int
  openedAt   DateTime    @default(now())
  closedAt   DateTime?   // set on payment; next QR scan opens a new session
  confirmed  Boolean     @default(false) // staff approved this visit
  orders     Order[]     // Order gets optional tableSessionId
}
```

`Order` would get an optional `tableSessionId`; `userId` may need to become
optional for guest dine-in orders. Prices still use the existing snapshot logic,
so finance reports keep working.

## Fits the existing app

- Admin page: `client/app/admin/tables/page.tsx` (editor) and
  `client/app/staff/floor/page.tsx` (live view).
- Server module: `server/src/modules/tables/` (routes, service, validation),
  same pattern as `menu` and `settings`.
- Layout changes go into the existing **audit log**.
- Uses the existing roles: Super Admin edits the layout, Staff runs the floor.
- Thai/THB and tax settings apply unchanged.

## Answered questions

- **Pay at table or counter?** At the counter. Staff create a PromptPay QR with
  the bill amount and bring it to the table (see section 4).
- **Kitchen display?** Yes, as its own page, see
  [idea-kitchen-display.md](idea-kitchen-display.md) (includes fridge/freezer and stock ideas).
- **One restaurant or branches?** One restaurant for now. Branches come later:
  keep table/zone code simple so a `branchId` can be added to `FloorZone` then.

## Open questions

- Where in the roadmap: after Phase 1 (real orders), since it depends on
  item options and payments being finished.
