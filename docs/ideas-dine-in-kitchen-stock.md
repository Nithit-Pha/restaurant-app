# Ideas after Phase 1: dine-in, kitchen, stock and stock ordering

Status: **Step 1 built** (2026-11-12, see [2026-11-12-step-1-dine-in.md](2026-11-12-step-1-dine-in.md)); Steps 2-4 are ideas with decisions made

This file replaces the three separate idea docs
(`idea-dine-in-table-layout.md`, `idea-kitchen-display.md`, `idea-stock-ordering.md`).

## Contents

- [Roadmap](#roadmap)
- [All decisions](#all-decisions)
- [Step 1 - Dine-in table layout + kitchen display page](#step-1---dine-in-table-layout--kitchen-display-page)
- [Step 2 - Ingredient stock](#step-2---ingredient-stock)
- [Step 3 - Stock ordering (raw material purchasing)](#step-3---stock-ordering-raw-material-purchasing)
- [Step 4 - Fridge and freezer sensors](#step-4---fridge-and-freezer-sensors)
- [Shared: owner alerts and permissions](#shared-owner-alerts-and-permissions)
- [Open questions](#open-questions)

## Roadmap

Decided 2026-11-12. Order after Phase 1 (Phase 1 is finished and being tested):

1. **Dine-in table layout + kitchen display page** - done 2026-11-12
2. **Ingredient stock**
3. **Stock ordering**
4. **Fridge/freezer sensors**

Each step uses the one before it: paid orders reduce stock, stock numbers drive
purchase orders, and the sensors are the only part that needs hardware.

## All decisions

| Topic | Decision | Date |
| --- | --- | --- |
| Layout editor | Grid-based editor with plain SVG + drag | 2026-11-11 |
| Table QR code | Fixed QR sticker per table; a new order starts after payment | 2026-11-11 |
| Live table status | Server-Sent Events (also feeds the kitchen page and alerts) | 2026-11-11 |
| Dine-in payment | At the counter: staff create a PromptPay QR with the bill amount and bring it to the table (cash also possible) | 2026-11-11 |
| Kitchen display | Yes, a separate page | 2026-11-11 |
| Scope | One restaurant only for now, branches later | 2026-11-11 |
| Fridge/freezer | Monitor + alerts only, no remote control | 2026-11-11 |
| Stock | Ingredient stock in the app (recipes, auto-deduct on payment) | 2026-11-11 |
| Order amount | Fill up to target level (usage-based suggestions later) | 2026-11-11 |
| Emergency level | Alert + ready-made urgent draft, sent with one tap | 2026-11-11 |
| Sending to supplier | PDF for now: download and forward by email, LINE, print. Automatic sending later | 2026-11-11 |
| Who may send orders | Only the owner (Super Admin) by default; owner can give it to Staff on Settings → Permissions | 2026-11-11 |
| Suppliers | Supplier list; each ingredient chooses its supplier from it (backup supplier later) | 2026-11-11 |
| Owner alerts | In the web app by default; LINE and email optional (Settings → Notifications) | 2026-11-11 |
| Roadmap | Order above | 2026-11-12 |
| Kitchen login | Normal Staff account (no separate Kitchen role); only Super Admin can edit the table layout | 2026-11-12 |
| Sensor hardware | Planned: ready-made Wi-Fi sensor (may change later) | 2026-11-12 |

---

## Step 1 - Dine-in table layout + kitchen display page

### Goal

Each restaurant **draws its own dining room** in the admin area: where the tables
are, their shape, how many seats each has, and which zone they belong to
(e.g. "Indoor", "Terrace", "2nd floor"). Staff then use that same floor plan as a
**live view** of the restaurant, guests order from their table, and the kitchen
sees what to cook on its own page.

Today the app only knows `PICKUP` and `DELIVERY` (`OrderType` in
`server/prisma/schema.prisma`), so dine-in guests cannot be handled at all.

### 1.1 Layout editor (Super Admin)
- Add tables from a toolbar: **round, square, rectangle**; set seats (2/4/6/8…).
- Drag to move, rotate, resize; snap to a grid so it always looks tidy.
- Label each table ("T1", "A3", "VIP 1").
- Several **zones / floors** as tabs.
- Optional decor shapes: walls, bar counter, kitchen door, entrance, plants.
- **Starter templates** for low-tech owners ("8 tables for 4", "café with bar"),
  then adjust, instead of starting from an empty canvas.
- Save / undo / "reset to last saved".

### 1.2 Live floor view (Staff)
- Same plan, each table coloured by status:
  - free · seated · ordered · food served · bill requested · needs cleaning
- Tap a table: guests count, time seated, current bill, items still in the kitchen.
- Actions: seat guests, open order, **move** guests to another table,
  **merge** tables for a big group, close bill, mark cleaned.

### 1.3 QR code for each table (Guests)
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
   land on the new order, which staff must confirm first.

Also:
- No account needed for dine-in guests.
- Admin can print all QR codes at once (one per table, with the table label),
  and regenerate a table's code if a sticker is damaged or copied.

### 1.4 Payment at the counter
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

### 1.5 Kitchen display page
- New page `client/app/kitchen/page.tsx` (on a tablet or TV in the kitchen).
- Kitchen staff log in with the **normal Staff account**, no separate role.
- One ticket per order: dine-in (shows table label, e.g. "T4"), pickup, delivery.
- Each item: **new → cooking → ready**; big tap buttons, no typing
  (wet or greasy hands).
- Timer per ticket, turns orange/red when it is taking too long.
- Sound when a new order arrives.
- "Ready" updates the waiter's live floor view instantly
  (same **Server-Sent Events** stream as the table status).
- Later: split by station (grill, drinks, desserts), each with its own screen.

### Later (not part of the first version)
- Reservations shown on the plan, split bill by seat, waiter assignment per zone,
  table turnover statistics in the finance dashboard.

### Choice: how to build the layout editor

Chosen: **Option 1 - grid-based editor with plain SVG + drag** (2026-11-11).

| Option | Pros | Cons |
| --- | --- | --- |
| **1. Grid-based editor with plain SVG + drag (chosen)** | No extra library; snapping keeps layouts neat; easy for low-tech owners; tables are simple data (`x, y, w, h, rotation`); works on tablets | Free-form shapes are limited; rotation/resize handles must be written by hand |
| 2. Canvas library (e.g. `react-konva`) | Smooth free drag, rotate and resize out of the box; good for complex rooms | Extra dependency (~150 KB); canvas is harder to make accessible and to style with Tailwind; easier for owners to make messy layouts |
| 3. No drawing, just a list/grid of table cards | Fastest to build; nothing to learn | Doesn't show the real room, so it's not a "custom layout"; staff lose the at-a-glance view |

### Choice: how the table QR code works with "new order after payment"

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

### Choice: how staff get live table status

Chosen: **Option 2 - Server-Sent Events** (2026-11-11). The same event stream
also feeds the kitchen display page and owner alerts.

| Option | Pros | Cons |
| --- | --- | --- |
| 1. Polling every 5–10 s | Simplest; no server changes beyond normal endpoints | Short delay; extra requests |
| **2. Server-Sent Events (chosen)** | Instant updates; one-way server→browser is all we need; works through normal HTTP | Need to handle reconnects; one open connection per staff device |
| 3. WebSockets (e.g. `socket.io`) | Two-way, very flexible | New dependency and more setup than this feature needs |

### Rough data model (sketch)

```prisma
enum OrderType { PICKUP DELIVERY DINE_IN }      // add DINE_IN

enum TableShape        { ROUND SQUARE RECT }
enum TableStatus       { FREE SEATED ORDERED SERVED BILL_REQUESTED CLEANING }
enum KitchenItemStatus { NEW COOKING READY SERVED }   // on OrderItem

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

### Fits the existing app
- Pages: `client/app/admin/tables/page.tsx` (editor),
  `client/app/staff/floor/page.tsx` (live view), `client/app/kitchen/page.tsx`.
- Server module: `server/src/modules/tables/` (routes, service, validation),
  same pattern as `menu` and `settings`.
- Layout changes go into the existing **audit log**.
- Uses the existing roles: **only Super Admin can edit the table layout**;
  Staff run the floor view and the kitchen page.
- Thai/THB and tax settings apply unchanged.
- One restaurant for now: keep table/zone code simple so a `branchId` can be
  added to `FloorZone` later.

---

## Step 2 - Ingredient stock

Chosen: **Option 1 - ingredient stock in the app** (2026-11-11).

### What it includes
- Ingredients with a unit (kg, pcs, L) and where they are stored
  ("Fridge 1", "Freezer", "Dry store").
- A **recipe per menu item**: how much of each ingredient one dish uses.
- Stock is **reduced automatically when an order is paid**.
- Low-stock alert when an ingredient drops below its reorder level.
- A dish shows **"sold out"** on the menu when an ingredient runs out.
- **"Count stock" screen:** staff type the real amount; the difference is saved
  (shows lost/wasted stock over time).
- **"Waste" button:** spoiled or dropped food, with a reason.
- Every change to stock is saved as a stock movement (history and checks).

### Choice: how stock is tracked

| Option | Pros | Cons |
| --- | --- | --- |
| **1. Ingredient stock in the app (chosen)** | Ingredients with unit; a recipe per menu item; stock is **reduced automatically when an order is paid**; low-stock alerts; automatic "sold out"; buying stock links to the existing Finance `FOOD_SUPPLY` expenses; covers fridge, freezer and dry storage | Owner must enter recipes once; real stock drifts, so staff do a quick count (e.g. weekly) on the "count stock" screen |
| 2. Simple manual stock list (no recipes) | Easiest; staff just update numbers and toggle "sold out" | No automatic deduction; relies on staff remembering |
| 3. Sensors to see stock (scales under containers, camera in the fridge) | Fully automatic for those items | Expensive, unreliable, only works for some items; still needs option 1 for the rest |

### Rough data model (sketch)

```prisma
enum StockMoveType { SALE PURCHASE COUNT_ADJUST WASTE }

model Ingredient {
  id           String  @id @default(uuid())
  name         String
  unit         String          // "kg", "pcs", "L"
  quantity     Decimal @db.Decimal(10, 3)
  reorderLevel Decimal @db.Decimal(10, 3)   // "low stock" below this
  storage      String?         // "Fridge 1", "Freezer", "Dry store"
  // Step 3 adds: supplierId, packSize, packName, targetLevel,
  //              emergencyLevel, lastPrice
}

model RecipeItem {                // how much of an ingredient one menu item uses
  menuItemId   String
  ingredientId String
  amount       Decimal @db.Decimal(10, 3)
  @@id([menuItemId, ingredientId])
}

model StockMovement {          // every change to stock, for history and checks
  id           String        @id @default(uuid())
  ingredientId String
  type         StockMoveType
  change       Decimal       @db.Decimal(10, 3)   // + in, - out
  reason       String?
  userId       String?
  createdAt    DateTime      @default(now())
}
```

### Fits the existing app
- Page: `client/app/admin/stock/` (ingredients, recipes, count, waste).
- Stock deduction runs in the same step that marks an order as paid.

---

## Step 3 - Stock ordering (raw material purchasing)

### Goal

Use the stock numbers from Step 2 to **order raw materials from suppliers**:

- set the **stock levels** for each ingredient,
- set **how often** each supplier gets a normal order,
- create an **emergency order** when stock falls below a safe level,
- **receive** the delivery so stock and Finance update automatically.

### 3.1 Stock settings per ingredient (Super Admin)
| Setting | Example | Meaning |
| --- | --- | --- |
| Unit | kg | how stock is counted |
| Pack size | 1 sack = 25 kg | orders are rounded up to whole packs |
| Supplier | "Somchai Market" | chosen from the **supplier list** (dropdown) |
| **Target level (par)** | 50 kg | how much we want after a delivery |
| **Reorder level** | 20 kg | below this, add it to the next normal order |
| **Emergency level** | 5 kg | below this, start an emergency order now |
| Lead time | 1 day | how long the supplier needs to deliver |
| Last price | ฿850 / sack | filled in automatically from the last delivery |

### 3.2 Suppliers (supplier list)
- Own page with the **list of all suppliers**: add, edit, deactivate.
- Each ingredient picks **one supplier** from this list (dropdown on the
  ingredient form). The supplier's page shows which ingredients it supplies,
  so a normal order for that supplier contains exactly those ingredients.
- Name, phone, **LINE ID**, email, address.
- Delivery days (e.g. Mon / Thu), order cut-off time (e.g. "order before 16:00"),
  minimum order amount.

### 3.3 Order frequency (normal orders)
- Per supplier: **daily**, **weekly on chosen days** (e.g. Mon + Thu),
  **every N days**, or **monthly** on a date.
- On that day (e.g. 1 hour before the cut-off) the app creates a **draft order**
  with every ingredient from that supplier that is under its reorder level.
- Owner (or Staff with the "send orders" permission) checks it, changes
  amounts if needed, presses **Send**.

### 3.4 Emergency order
- When an ingredient drops below its **emergency level** (after a sale, a stock
  count or a waste entry):
  - alert in the web app (admin and kitchen pages); also by LINE or email if
    the owner turned that on (see [owner alerts](#owner-alerts)),
  - an **urgent draft order** for that ingredient's supplier is ready to send
    with one tap,
  - optional: dishes that need it are marked **"sold out"** when it reaches 0.

### 3.5 Sending an order (PDF)
"Send" on a draft creates a clean **purchase order PDF** (restaurant name,
supplier, date, order number, items with packs and amounts, delivery date,
notes) and downloads it. The owner forwards the file by email, LINE or prints
it, and the order is marked **Sent**.

### 3.6 Receiving a delivery (Staff)
- Open the sent order, tick each line, enter the **amount actually received**
  and the **real price** (suppliers often deliver a bit more or less).
- Press **Received** → stock goes up, last price updates, and a Finance expense
  (`FOOD_SUPPLY`) is created automatically, so no double entry.
- Order status: **Draft → Sent → Partly received → Received** (or Cancelled).

### Later (not part of the first version)
- Suggested target levels from past sales (busy weekends need more).
- LINE / email sending straight from the app.
- Price history and "supplier X got 10% more expensive" warning.
- Expiry dates / first-in-first-out per delivery batch.
- Branches: one supplier list, stock per branch.
- Backup supplier per ingredient (used for emergency orders if the main one
  can't deliver in time).

### Choice: how the order amount is calculated

Chosen: **Option 2 - fill up to target level** (2026-11-11).

| Option | Pros | Cons |
| --- | --- | --- |
| 1. Fixed amount per order (always order 2 sacks) | Very simple to understand | Ignores real stock; leads to too much or too little |
| **2. Fill up to target level (chosen)** | Amount = target − current stock, rounded up to whole packs; easy for owners to set and check; uses the real stock the app already tracks | Owner must pick good target levels; doesn't know busy vs quiet weeks |
| 3. Based on usage (average daily use × days until next delivery + safety stock) | Adapts automatically to busy periods; least waste | Needs weeks of sales history first; harder to explain why the app ordered that amount |

Option 3 can be added later as **"suggested target level"** once there is
enough history.

### Choice: what happens at the emergency level

Chosen: **Option 2 - alert + ready-made urgent draft, sent with one tap** (2026-11-11).

| Option | Pros | Cons |
| --- | --- | --- |
| 1. Alert only | Simplest; owner stays fully in control | Owner must make the order by hand, under time pressure |
| **2. Alert + ready-made urgent draft, sent with one tap (chosen)** | Fast; still a human check, so a wrong stock number never sends a wrong order | Someone has to see the alert and tap Send |
| 3. Send the order to the supplier automatically | Nothing to do | A wrong count or a bug orders real goods and costs money; suppliers may get duplicate orders |

### Choice: how an order reaches the supplier

Chosen: **Option 1 - PDF for now** (2026-11-11).

| Option | Pros | Cons |
| --- | --- | --- |
| **1. Print / PDF (chosen)** | Works with any supplier, also by hand | Someone still has to send or hand it over |
| 2. LINE message (later) | Most Thai suppliers use LINE; app makes a clear order text (or PDF) and opens LINE to send it; no setup for the supplier | Fully automatic sending needs the LINE Messaging API (business account) |
| 3. Email | Easy to automate; good record | Many small market suppliers don't check email |
| 4. Supplier's own system / API | Fully automatic | Only big suppliers (e.g. Makro) have one; different for each |

### Rough data model (sketch)

```prisma
enum OrderFrequency { DAILY WEEKLY EVERY_N_DAYS MONTHLY }
enum PurchaseStatus { DRAFT SENT PARTLY_RECEIVED RECEIVED CANCELLED }

model Supplier {
  id            String  @id @default(uuid())
  name          String
  phone         String?
  lineId        String?
  email         String?
  isActive      Boolean @default(true)
  frequency     OrderFrequency
  weekdays      Int[]           // for WEEKLY: 1 = Mon ... 7 = Sun
  everyNDays    Int?
  monthDay      Int?
  cutOffTime    String?         // "16:00"
  leadTimeDays  Int     @default(1)
  minOrder      Decimal? @db.Decimal(10, 2)
  ingredients   Ingredient[]
  orders        PurchaseOrder[]
}

// added to Ingredient (from Step 2):
//   supplierId (chosen from the supplier list), packSize, packName ("sack"),
//   targetLevel, emergencyLevel, lastPrice

model PurchaseOrder {
  id          String         @id @default(uuid())
  supplier    Supplier       @relation(fields: [supplierId], references: [id])
  supplierId  String
  status      PurchaseStatus @default(DRAFT)
  isEmergency Boolean        @default(false)
  items       PurchaseOrderItem[]
  sentAt      DateTime?
  receivedAt  DateTime?
  expenseId   String?        // Finance expense created on receive
  createdAt   DateTime       @default(now())
}

model PurchaseOrderItem {
  id            String  @id @default(uuid())
  orderId       String
  ingredientId  String
  packs         Int                       // ordered
  receivedQty   Decimal? @db.Decimal(10, 3)
  unitPrice     Decimal? @db.Decimal(10, 2)
}
```

### Fits the existing app
- Pages: `client/app/admin/suppliers/`, `client/app/admin/purchase-orders/`.
- Server module `server/src/modules/purchasing/`, same pattern as `finance`.
- A small scheduled job on the server (checks every few minutes) creates the
  normal drafts on order days; emergency checks run right after each stock change.
- Receiving creates the `FOOD_SUPPLY` expense in the existing Finance module.
- Level changes and sent orders go into the **audit log**.

---

## Step 4 - Fridge and freezer sensors

Chosen: **Option 1 - monitor + alerts only** (2026-11-11).

Hardware: **ready-made Wi-Fi sensor planned** (2026-11-12, may change later,
e.g. to a self-built ESP32). When choosing a model, check that it can send
readings to our own server (HTTP/webhook) or has a local API the app can read;
some cheap sensors only send to their maker's cloud app. The app side stays the
same whichever sensor is used, so changing hardware later is easy.

### What it includes
- A small temperature sensor in each fridge/freezer sends a reading every
  minute to the app (simple HTTP request with a device key, so the owner does
  not need to install an extra MQTT broker).
- The kitchen page shows every fridge's current temperature.
- Alert when too warm/cold or when a sensor goes offline
  (see [owner alerts](#owner-alerts)).
- Temperature log for food-safety checks.
- The fridge's own thermostat keeps controlling the temperature.

### Choice: monitor only or also control

| Option | Pros | Cons |
| --- | --- | --- |
| **1. Monitor + alerts only (chosen)** | Cheap ready-made Wi-Fi sensor or ESP32 + waterproof probe; temperature log for food-safety checks; the fridge's own thermostat keeps controlling, so a bug or network outage cannot spoil food | You cannot change the temperature from the app (adjust on the fridge itself) |
| 2. Monitor + remote control (smart relay/thermostat on the compressor) | Change the set temperature from the app | Bypasses the fridge's own controller: risk of damaging the compressor, may void warranty; a bug or Wi-Fi outage could spoil food; mains electrical work needs an electrician |
| 3. Buy "smart" commercial fridges with the maker's app/API | Control done properly by the manufacturer | Expensive; every brand has a different API (or none); vendor lock-in |

### Rough data model (sketch)

```prisma
model TempSensor {
  id        String  @id @default(uuid())
  name      String          // "Freezer 1"
  minTemp   Decimal @db.Decimal(5, 1)
  maxTemp   Decimal @db.Decimal(5, 1)
  deviceKey String  @unique // sensor authenticates with this
  readings  TempReading[]
}

model TempReading {
  id        String     @id @default(uuid())
  sensor    TempSensor @relation(fields: [sensorId], references: [id])
  sensorId  String
  value     Decimal    @db.Decimal(5, 1)
  createdAt DateTime   @default(now())
  @@index([sensorId, createdAt])
}
```

---

## Shared: owner alerts and permissions

### Owner alerts
Used by low stock, emergency stock (Step 3) and fridge temperature (Step 4).

- **Default: alerts in the web app only** - a bell with a counter in the admin
  sidebar, a banner on the admin and kitchen pages, and a short sound.
  Nothing to set up. Delivered through the same Server-Sent Events stream.
- **Optional, turned on by the owner** on a new **Settings → Notifications** sub page:
  - **LINE:** sent through the LINE Messaging API, which needs a free LINE
    Official Account (the older "LINE Notify" service was shut down in 2025).
    The settings page explains the steps.
  - **Email:** the owner enters an email address and the mail account details
    (e.g. a Gmail app password).
- The owner chooses **which alerts** go out by LINE/email (e.g. only emergency
  stock and fridge temperature, not every low-stock warning).

### Permissions (new sub page: Settings → Permissions)
- New page under the existing admin Settings: `client/app/admin/settings/permissions/`.
- A simple on/off list per role. Defaults:

  | Permission | Super Admin | Staff |
  | --- | --- | --- |
  | Send purchase orders | always | **off** (owner can turn on) |
  | Edit stock levels and suppliers | always | off |
  | Receive deliveries | always | on |
  | Count stock / enter waste | always | on |

- Only the Super Admin can open this page; every change goes into the audit log.
- Built so more permissions (e.g. refunds, menu prices) can be added later.
- Stored in the existing key/value `Setting` table (key `PERMISSIONS`, JSON such
  as `{"purchase.send": ["SUPER_ADMIN"]}`); a small
  `requirePermission("purchase.send")` middleware next to `requireRole` checks them.

---

## Open questions

None at the moment. Next step: a build plan for Step 1 (dine-in + kitchen page).
