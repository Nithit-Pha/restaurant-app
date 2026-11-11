# Idea: Kitchen display, fridge/freezer and stock

Status: **idea**, not scheduled yet (added 2026-11-11)

Decisions so far (2026-11-11):
- Kitchen display: **separate page**
- Fridge/freezer: **option 1 - monitor + alerts only** (no remote control)
- Stock: **option 1 - ingredient stock in the app** (recipes, auto-deduct on payment)
Related: [idea-dine-in-table-layout.md](idea-dine-in-table-layout.md)

## Goal

A separate **Kitchen page** (on a tablet or TV in the kitchen) that shows what
to cook, plus the kitchen's **fridges and freezers** (temperature) and **stock**
in the same app.

## Part 1: Kitchen display page (recommended: build together with dine-in)

- New page `client/app/kitchen/page.tsx`, for Staff role (or a "Kitchen" login).
- One ticket per order: dine-in (shows table label, e.g. "T4"), pickup, delivery.
- Each item: **new → cooking → ready**; big tap buttons, no typing
  (wet or greasy hands).
- Timer per ticket, turns orange/red when it is taking too long.
- Sound when a new order arrives.
- "Ready" updates the waiter's live floor view instantly
  (same **Server-Sent Events** stream as the table status).
- Later: split by station (grill, drinks, desserts), each with its own screen.

## Part 2: Fridge and freezer temperature

Chosen: **Option 1 - monitor + alerts only** (2026-11-11).

How the fridge connects: a small temperature sensor in each fridge/freezer sends
a reading every minute to the app (simple HTTP request with a device key, so
the owner does not need to install an extra MQTT broker).

| Option | Pros | Cons |
| --- | --- | --- |
| **1. Monitor + alerts only (chosen)** | Cheap ready-made Wi-Fi sensor or ESP32 + waterproof probe; kitchen page shows every fridge's temperature; alert when too warm or sensor offline; temperature log for food-safety checks; the fridge's own thermostat keeps controlling, so a bug or network outage cannot spoil food | You cannot change the temperature from the app (adjust on the fridge itself) |
| 2. Monitor + remote control (smart relay/thermostat on the compressor) | Change the set temperature from the app | Bypasses the fridge's own controller: risk of damaging the compressor, may void warranty; a bug or Wi-Fi outage could spoil food; mains electrical work needs an electrician |
| 3. Buy "smart" commercial fridges with the maker's app/API | Control done properly by the manufacturer | Expensive; every brand has a different API (or none); vendor lock-in |

## Part 3: Stock

Chosen: **Option 1 - ingredient stock in the app** (2026-11-11).

| Option | Pros | Cons |
| --- | --- | --- |
| **1. Ingredient stock in the app (chosen)** | Ingredients with unit (kg, pcs, L); a recipe per menu item; stock is **reduced automatically when an order is paid**; low-stock alerts; menu item shows **"sold out"** when an ingredient runs out; buying stock links to the existing Finance `FOOD_SUPPLY` expenses; covers fridge, freezer and dry storage | Owner must enter recipes once; real stock drifts, so staff do a quick count (e.g. weekly) on a "count stock" screen |
| 2. Simple manual stock list (no recipes) | Easiest; staff just update numbers and toggle "sold out" | No automatic deduction; relies on staff remembering |
| 3. Sensors to see stock (scales under containers, camera in the fridge) | Fully automatic for those items | Expensive, unreliable, only works for some items; still needs option 1 for the rest |

## Recommended order

1. Kitchen display page (with the dine-in feature).
2. Ingredient stock (software only, no hardware).
3. Fridge/freezer temperature monitoring (needs sensors bought and installed).

## Rough data model (sketch)

```prisma
enum KitchenItemStatus { NEW COOKING READY SERVED }   // on OrderItem

model Ingredient {
  id            String  @id @default(uuid())
  name          String
  unit          String          // "kg", "pcs", "L"
  quantity      Decimal @db.Decimal(10, 3)
  lowStockLevel Decimal @db.Decimal(10, 3)
  storage       String?         // "Fridge 1", "Freezer", "Dry store"
}

model RecipeItem {                // how much of an ingredient one menu item uses
  menuItemId   String
  ingredientId String
  amount       Decimal @db.Decimal(10, 3)
  @@id([menuItemId, ingredientId])
}

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

## Open questions

- Which sensor hardware: ready-made Wi-Fi sensor or self-built ESP32?
- Should temperature alerts also go to the owner's phone (LINE message)?
- Kitchen login: use the normal Staff account, or a separate "Kitchen" role?
