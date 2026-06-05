# Restaurant Web Application — Project Plan & Architecture

**Prepared by:** Senior Full-Stack Architect
**Stack:** React + Tailwind + Redux Toolkit (frontend) · Node.js/Express + PostgreSQL (backend)
**Date:** June 2026

---

## 1. Executive Summary & Recommendations

This document is a buildable blueprint for a full-stack restaurant application supporting an admin-managed menu, a cart with tax/profit calculation, and a pickup/delivery checkout with order tracking.

**Two key recommendations up front:**

**Database — use PostgreSQL, not MongoDB.** This app is fundamentally relational and transactional. Orders reference users and menu items, an order line-item must lock in the price at time of purchase, profit margins require reliable joins between cost and selling price, and checkout must be atomic (you cannot half-create an order). PostgreSQL gives you ACID transactions, foreign-key integrity, `NUMERIC` types for money (no floating-point rounding errors on currency), and mature support via Prisma/Sequelize. MongoDB's document model shines for catalog-style, schema-loose data, but here the relational guarantees matter more than flexible schemas. Use PostgreSQL with the **Prisma ORM**.

**State management — use Redux Toolkit.** The cart is global, persistent across routes, and mutated from many components (menu cards, cart drawer, checkout). Context API works but re-renders broadly and gets unwieldy with derived values like tax and totals. Redux Toolkit (RTK) with `createSlice` plus `RTK Query` for server data is the cleaner choice and keeps cart math in one tested place.

---

## 2. Architecture & Tech Stack

### Frontend
| Concern | Choice |
|---|---|
| Framework | React 18 (Vite) |
| Styling | Tailwind CSS |
| Global state | Redux Toolkit (cart, auth) |
| Server state / caching | RTK Query |
| Routing | React Router v6 |
| Forms | React Hook Form + Zod validation |
| HTTP | Axios (or RTK Query's baseQuery) |
| Image preview | Native FileReader / object URLs |

### Backend
| Concern | Choice |
|---|---|
| Runtime | Node.js (LTS) + Express |
| Language | TypeScript (strongly recommended) |
| ORM | Prisma |
| Database | PostgreSQL 16 |
| Auth | JWT (access + refresh) + bcrypt |
| Validation | Zod |
| File upload | Multer → local disk (dev) / S3 or Cloudinary (prod) |
| Config | dotenv |
| Logging | pino or morgan |

### High-level diagram
```
[ React SPA ]  --HTTPS/JSON-->  [ Express REST API ]  --Prisma-->  [ PostgreSQL ]
      |                                |
   Tailwind UI                    JWT auth middleware
   Redux cart                     Multer image upload --> /uploads or S3
```

### System design notes
- **Stateless API + JWT** so the backend scales horizontally.
- **Money as integers (cents) or `NUMERIC(10,2)`** — never JS floats. This plan uses `NUMERIC` in the DB and computes in minor units on the server.
- **Server is the source of truth for all pricing.** The client cart is for display; the server recomputes subtotal, tax, delivery fee, and total at checkout to prevent tampering.
- **Image upload** abstracted behind a storage interface so dev (local disk) and prod (S3/Cloudinary) swap cleanly.

---

## 3. Directory Structure

### Backend (`/server`)
```
server/
├── prisma/
│   ├── schema.prisma          # DB models
│   └── seed.ts                # seed admin + sample menu
├── src/
│   ├── config/
│   │   ├── env.ts             # validated env vars
│   │   └── db.ts              # Prisma client singleton
│   ├── middleware/
│   │   ├── auth.ts            # verify JWT, attach req.user
│   │   ├── requireRole.ts     # role guard: requireRole('STAFF','SUPER_ADMIN')
│   │   ├── upload.ts          # multer config
│   │   ├── validate.ts        # zod request validation
│   │   └── errorHandler.ts    # central error formatting
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   └── auth.service.ts
│   │   ├── menu/
│   │   │   ├── menu.routes.ts
│   │   │   ├── menu.controller.ts
│   │   │   └── menu.service.ts
│   │   └── orders/
│   │       ├── orders.routes.ts
│   │       ├── orders.controller.ts
│   │       └── orders.service.ts   # cart/tax/fee/total math lives here
│   ├── utils/
│   │   ├── pricing.ts         # subtotal, tax, delivery, profit
│   │   └── jwt.ts
│   ├── app.ts                 # express app + route mounting
│   └── server.ts              # listen()
├── uploads/                   # local image storage (dev)
├── .env
├── package.json
└── tsconfig.json
```

### Frontend (`/client`)
```
client/
├── public/
├── src/
│   ├── app/
│   │   └── store.ts           # RTK store
│   ├── api/
│   │   └── apiSlice.ts        # RTK Query base + endpoints
│   ├── features/
│   │   ├── auth/
│   │   │   ├── authSlice.ts
│   │   │   ├── LoginPage.tsx
│   │   │   └── RegisterPage.tsx
│   │   ├── menu/
│   │   │   ├── MenuPage.tsx
│   │   │   ├── MenuItemCard.tsx
│   │   │   └── CategoryTabs.tsx
│   │   ├── cart/
│   │   │   ├── cartSlice.ts        # add/remove/qty + selectors
│   │   │   ├── CartDrawer.tsx
│   │   │   └── CartSummary.tsx     # subtotal/tax/total breakdown
│   │   ├── checkout/
│   │   │   ├── CheckoutPage.tsx     # pickup vs delivery
│   │   │   └── DeliveryForm.tsx
│   │   ├── orders/
│   │   │   ├── MyOrdersPage.tsx
│   │   │   └── OrderStatusBadge.tsx
│   │   └── admin/
│   │       ├── AdminMenuPage.tsx    # CRUD table
│   │       ├── MenuItemForm.tsx     # add/edit + image upload
│   │       └── AdminOrdersPage.tsx  # update status
│   ├── components/            # Button, Modal, Input, etc.
│   ├── routes/
│   │   ├── ProtectedRoute.tsx
│   │   └── AdminRoute.tsx
│   ├── lib/
│   │   └── format.ts          # currency formatting
│   ├── App.tsx
│   └── main.tsx
├── tailwind.config.js
├── index.html
└── package.json
```

---

## 4. Database Schema (Prisma / PostgreSQL)

```prisma
// schema.prisma

enum Role {
  CUSTOMER     // browse, order, pay
  STAFF        // manage menu items, prices, delivery status
  SUPER_ADMIN  // + tax rates, delivery fees, profit margins
}

enum OrderType {
  PICKUP
  DELIVERY
}

enum OrderStatus {
  PENDING
  PREPARING
  OUT_FOR_DELIVERY
  DELIVERED
  CANCELLED
}

model User {
  id        String   @id @default(uuid())
  name      String
  email     String   @unique
  password  String                       // bcrypt hash
  role      Role     @default(CUSTOMER)
  phone     String?
  address   String?                      // default delivery address
  orders    Order[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model MenuItem {
  id           String   @id @default(uuid())
  name         String
  description  String?
  category     String                     // Appetizers | Mains | Drinks | Desserts ...
  costPrice    Decimal  @db.Decimal(10,2) // what it costs the restaurant
  sellingPrice Decimal  @db.Decimal(10,2) // menu price shown to customer
  imageUrl     String?
  isAvailable  Boolean  @default(true)
  orderItems   OrderItem[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([category])
}

model Order {
  id            String      @id @default(uuid())
  user          User        @relation(fields: [userId], references: [id])
  userId        String
  items         OrderItem[]
  type          OrderType
  status        OrderStatus @default(PENDING)

  // delivery details (null for pickup)
  deliveryAddress String?
  deliveryLat     Float?
  deliveryLng     Float?

  // money snapshot — locked at checkout (NUMERIC, not float)
  subtotal      Decimal  @db.Decimal(10,2)
  taxRate       Decimal  @db.Decimal(5,4)   // e.g. 0.0700 = 7%
  taxAmount     Decimal  @db.Decimal(10,2)
  deliveryFee   Decimal  @db.Decimal(10,2)  @default(0)
  total         Decimal  @db.Decimal(10,2)
  totalCost     Decimal  @db.Decimal(10,2)  // sum of cost prices (for profit)
  profit        Decimal  @db.Decimal(10,2)  // total - tax - totalCost

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId])
  @@index([status])
}

// line items snapshot price AT TIME OF ORDER so later menu edits
// never retroactively change historical orders
model OrderItem {
  id           String   @id @default(uuid())
  order        Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  orderId      String
  menuItem     MenuItem @relation(fields: [menuItemId], references: [id])
  menuItemId   String
  nameSnapshot String                       // name at purchase time
  unitPrice    Decimal  @db.Decimal(10,2)   // sellingPrice snapshot
  unitCost     Decimal  @db.Decimal(10,2)   // costPrice snapshot
  quantity     Int
}

// ---- Expense (operating costs: rent, labor, utilities, etc.) ----
enum ExpenseCategory {
  RENT
  LABOR
  UTILITIES
  FOOD_SUPPLY
  MARKETING
  MISCELLANEOUS
}

model Expense {
  id          String          @id @default(uuid())
  amount      Decimal         @db.Decimal(10,2)  // always > 0 (app-enforced)
  category    ExpenseCategory
  date        DateTime        @default(now())
  description String?
  createdBy   User?           @relation(fields: [createdById], references: [id])
  createdById String?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@index([date])
  @@index([category])
}
```

> **Order financial snapshot:** the `Order` model already stores `subtotal` (= total selling price / food revenue), `totalCost` (= total cost price / COGS), and `profit` (`subtotal − totalCost`), all locked at checkout. The finance dashboard reads these snapshots so historical reports never shift when menu prices change.

**Why snapshots matter:** if an admin raises a burger's price next month, every past order must still show the price the customer actually paid. Copying `name`, `unitPrice`, and `unitCost` into `OrderItem` at checkout guarantees immutable order history and accurate historical profit reporting.

---

## 5. Core Feature Logic

### 5.0 Roles & Permissions (RBAC)

Three roles, hierarchical — each higher role inherits everything below it.

| Role | Can do | Cannot do |
|---|---|---|
| **Customer** | Browse menu, build cart, place orders, pay, view & track own orders | Touch the menu, pricing, fees, or other users' orders |
| **Staff / Admin** | Everything a Customer can, **plus** add/edit/delete menu items, change item prices, toggle availability, update order/delivery status | Change tax rate, edit delivery-fee config, view profit margins |
| **Super Admin** | Everything Staff can, **plus** set the tax rate, edit delivery-fee rules, view cost/profit-margin reports, manage staff accounts | — (full control) |

**Enforcement.** A single `requireRole(...roles)` middleware checks `req.user.role` after JWT verification. Routes declare the minimum roles allowed, e.g. `router.post('/menu', auth, requireRole('STAFF','SUPER_ADMIN'), ...)`. Because the hierarchy is `CUSTOMER < STAFF < SUPER_ADMIN`, the guard accepts any listed role or higher.

**Sensitive-data gating.** Cost price, profit, and `totalCost` fields are stripped from API responses unless `req.user.role === 'SUPER_ADMIN'`. Tax-rate and delivery-fee **write** endpoints are `SUPER_ADMIN`-only; everyone reads the resulting totals, but only Super Admin configures the inputs.

**Frontend.** `AdminRoute` becomes `RoleRoute(minRole)`. Menu management UI shows for Staff+; the Settings panel (tax/fees) and profit dashboard render only for Super Admin. UI gating is convenience only — the server is the real authority.

### 5.1 Menu Management (Staff / Admin CRUD)
- Admins authenticate (role `ADMIN`) and reach `/admin/menu`.
- Create/edit form posts `multipart/form-data` (fields + image file). Multer stores the file, returns `imageUrl`.
- Category is a string field with a controlled dropdown (`Appetizers`, `Mains`, `Drinks`, `Desserts`) — easy to extend to a `Category` table later.
- `isAvailable` toggle hides an item from customers without deleting it (preserves order history references).
- Delete is a soft consideration: prefer setting `isAvailable=false`; only hard-delete if no orders reference it (FK protects integrity).

### 5.2 Cost, Tax & Profit Calculation
All computed server-side in `utils/pricing.ts`. The client mirrors it for instant display, but the server value wins at checkout.

```ts
// pricing.ts — money handled as Decimal/cents on server
function priceCart(lines, taxRate, deliveryFee) {
  const subtotal  = sum(lines.map(l => l.unitPrice * l.quantity));
  const totalCost = sum(lines.map(l => l.unitCost  * l.quantity));
  const taxAmount = round2(subtotal * taxRate);
  const total     = round2(subtotal + taxAmount + deliveryFee);
  const profit    = round2(subtotal - totalCost);   // tax & fee are pass-through
  return { subtotal, taxAmount, deliveryFee, total, totalCost, profit };
}
```

- **Tax rate is customizable by Super Admin only** via `PUT /api/settings/tax` (persisted in a `Setting` table; `TAX_RATE` env is just the seed default). Stored per-order so changing the rate later doesn't alter past orders. Staff and Customers consume the rate but cannot change it.
- **Profit margin** = `subtotal − totalCost`. Tax and delivery fee are treated as pass-through (not profit). Per-item margin % = `(sellingPrice − costPrice) / sellingPrice`.
- **Final breakdown** shown to user: Subtotal → Tax (X%) → Delivery Fee → **Total**. Cost/profit fields are admin-only.

### 5.3 Online Delivery System
- Checkout offers **Pickup** or **Delivery** (radio).
- **Pickup:** `deliveryFee = 0`, no address required.
- **Delivery:** capture address; compute a **mock delivery fee**:
  - Simple model: flat base (`$3.99`) + `$1.00` per km beyond 3 km. **Base and per-km rates are editable by Super Admin** via `PUT /api/settings/delivery-fee`.
  - Distance from a mock geocode (store lat/lng vs. a hardcoded restaurant origin; use the haversine formula). For an MVP, a flat fee or a zip-code lookup table is acceptable.
- **Order status lifecycle:** `PENDING → PREPARING → OUT_FOR_DELIVERY → DELIVERED` (plus `CANCELLED`). Pickup orders skip `OUT_FOR_DELIVERY` (go `PREPARING → DELIVERED`/ready).
- Admin updates status from `/admin/orders`; customer sees live status on `/orders` (poll every ~15s, or upgrade to WebSocket/SSE later).
- **Checkout is one transaction:** validate cart against current menu prices, recompute totals, create `Order` + `OrderItem`s atomically (`prisma.$transaction`). Reject if any item became unavailable.

---

## 6. API Endpoints

### Auth
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | create customer account |
| POST | `/api/auth/login` | public | returns access + refresh JWT |
| POST | `/api/auth/refresh` | refresh token | new access token |
| GET | `/api/auth/me` | user | current profile |

### Menu
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/menu` | public | list items (filter `?category=`, `?available=true`) |
| GET | `/api/menu/:id` | public | single item |
| POST | `/api/menu` | Staff+ | create item (multipart, image) |
| PUT | `/api/menu/:id` | Staff+ | update item / change price |
| PATCH | `/api/menu/:id/availability` | Staff+ | toggle availability |
| DELETE | `/api/menu/:id` | Staff+ | delete item |
| GET | `/api/menu/categories` | public | distinct category list |

*Cost price & margin fields in menu responses are returned only to Super Admin.*

### Orders
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/orders/quote` | user | server-side price preview (subtotal/tax/fee/total) without saving |
| POST | `/api/orders` | user | place order (atomic; recomputes totals) |
| GET | `/api/orders` | user | current user's orders |
| GET | `/api/orders/:id` | owner / Staff+ | order detail |
| GET | `/api/admin/orders` | Staff+ | all orders (filter `?status=`) |
| PATCH | `/api/orders/:id/status` | Staff+ | advance order / delivery status |

### Settings & reporting (Super Admin)
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/settings` | Staff+ | read current tax rate & delivery-fee config |
| PUT | `/api/settings/tax` | Super Admin | set tax rate |
| PUT | `/api/settings/delivery-fee` | Super Admin | edit delivery-fee rules (base, per-km) |
| GET | `/api/admin/reports/profit` | Super Admin | profit by date range / item |
| POST | `/api/admin/staff` | Super Admin | create/manage Staff & Super Admin accounts |

### Finance (Super Admin) — see §9 for full code
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/finance/dashboard?startDate=&endDate=` | Super Admin | Revenue, COGS, gross profit, operating expenses, net profit + combined transaction history |
| GET | `/api/finance/expenses` | Super Admin | list expenses (optional date filter) |
| GET | `/api/finance/expenses/:id` | Super Admin | single expense |
| POST | `/api/finance/expenses` | Super Admin | create expense (amount must be > 0) |
| PUT | `/api/finance/expenses/:id` | Super Admin | update expense |
| DELETE | `/api/finance/expenses/:id` | Super Admin | delete expense |

**Note the `/api/orders/quote` endpoint** — it lets the cart show a server-verified total before the user commits, keeping the client honest without creating an order.

---

## 7. Development Roadmap (Milestones)

### Milestone 0 — Project Setup (½–1 day)
- Init monorepo (`/client`, `/server`), Git, Prettier/ESLint.
- Backend: Express + TS + Prisma + PostgreSQL (Docker compose for local DB).
- Frontend: Vite + React + Tailwind + Redux store skeleton.
- `.env` wiring, health-check route, CORS.

### Milestone 1 — Auth & Users (2–3 days)
- Prisma `User` model + migration.
- Register/login, bcrypt, JWT issue/refresh, `auth` + `requireRole` middleware with the 3-role hierarchy (Customer / Staff / Super Admin).
- Frontend login/register pages, `authSlice`, `ProtectedRoute`/`RoleRoute(minRole)`.
- Seed one Super Admin and one Staff account.

### Milestone 2 — Menu Management (3–4 days)
- `MenuItem` model + migration.
- Public menu endpoints; admin CRUD with Multer image upload + storage abstraction.
- Frontend menu page (category tabs, cards), admin menu table + add/edit form with image preview.
- **Deliverable:** browse menu as customer; manage menu as admin.

### Milestone 3 — Cart, Tax & Profit (2–3 days)
- `cartSlice` (add/remove/qty) + memoized selectors for subtotal/tax/total.
- `pricing.ts` shared logic; `/api/orders/quote` endpoint.
- Cart drawer + total breakdown UI.
- Per-item margin display in admin.
- **Deliverable:** working cart with live, server-verified totals.

### Milestone 4 — Checkout & Delivery (3–4 days)
- `Order` + `OrderItem` models + migration.
- Pickup/delivery selection, address capture, mock delivery-fee calc.
- Atomic `POST /api/orders` (transaction, snapshotting, availability check).
- Order confirmation screen.
- **Deliverable:** end-to-end purchase.

### Milestone 5 — Order Tracking (2 days)
- Status lifecycle + admin status updates.
- Customer "My Orders" with status badges; polling for live updates.
- Admin orders dashboard with filters.
- **Deliverable:** full order tracking both sides.

### Milestone 6 — Finance & Reporting (3–4 days)
- `Expense` model + migration; reuse `Order` cost/profit snapshots.
- `GET /api/finance/dashboard` (Revenue, COGS, Gross Profit, Operating Expenses, Net Profit) + combined transaction history.
- Expense CRUD endpoints (Super Admin), positive-amount validation.
- Super Admin Financial Dashboard: date-range filter, KPI cards, transaction table, add-expense modal.
- Form validation (Zod), error states, loading skeletons, toasts.
- Responsive Tailwind pass, empty states.
- **Deliverable:** working P&L view. Code is in §9.

### Milestone 7 — Testing & Deploy (2–3 days)
- Backend: Jest/Vitest unit tests for `pricing.ts` (critical), integration tests for checkout.
- Frontend: component tests for cart math.
- Deploy: backend (Render/Railway/Fly), Postgres (managed), frontend (Vercel/Netlify), images (S3/Cloudinary).
- CI: lint + test on PR.

**Total estimate:** ~3–4 weeks for a single full-stack developer to a solid MVP.

---

## 8. Critical Implementation Cautions
1. **Never trust client prices.** Always recompute at `/quote` and `/orders` from the DB.
2. **Money = `Decimal`/integer cents.** Floating point will silently corrupt totals.
3. **Snapshot order line items.** Protects history and profit accuracy against later menu edits.
4. **Checkout must be transactional.** Use `prisma.$transaction` so an order is never partially written.
5. **Validate image uploads** (mime type, size limit) and serve from a CDN in production.
6. **Test `pricing.ts` first and hardest** — it's the financial heart of the app.

---

## 9. Finance & Expense Tracking Feature (full implementation)

A Super-Admin-only profit & loss layer on top of the order system. It answers one question for the owner: *did the restaurant actually make money this period?*

### 9.1 The P&L formula
```
Total Revenue          = Σ Order.subtotal           (total selling price, non-cancelled orders)
Total COGS             = Σ Order.totalCost           (total cost-of-ingredients snapshot)
Gross Profit (food)    = Total Revenue − Total COGS
Total Operating Expenses = Σ Expense.amount          (rent, labor, utilities, …)
Net Profit             = Gross Profit − Total Operating Expenses
```
Revenue and COGS come from the per-order **snapshots** taken at checkout, so editing a menu price today never rewrites last month's numbers. Operating expenses are tracked separately in the `Expense` table.

### 9.2 Data model
- **`MenuItem`** carries both `costPrice` (ingredients) and `sellingPrice` (menu price) — already in §4.
- **`Order`** snapshots `subtotal` (revenue), `totalCost` (COGS) and `profit` at checkout — already in §4.
- **`Expense`** (new): `amount` (Decimal, > 0), `category` (`RENT | LABOR | UTILITIES | FOOD_SUPPLY | MARKETING | MISCELLANEOUS`), `date`, `description`, `createdById`.

### 9.3 Delivered files
**Backend (Node/Express + Prisma + Zod):**
- `server/prisma/finance.schema.prisma` — `Expense` model + `ExpenseCategory` enum (merge into main schema, then migrate).
- `server/src/modules/finance/finance.validation.ts` — Zod schemas; **amount must be a positive, finite number**.
- `server/src/modules/finance/finance.service.ts` — dashboard aggregation (COGS, gross/net profit), combined transaction history, expense CRUD. Money handled via `Prisma.Decimal`.
- `server/src/modules/finance/finance.controller.ts` — thin controllers, validation, 400/404 handling, async error forwarding.
- `server/src/modules/finance/finance.routes.ts` — all routes guarded by `auth + requireRole('SUPER_ADMIN')`.

**Frontend (React + Tailwind + RTK Query):**
- `client/src/features/admin/finance/financeApi.ts` — typed RTK Query endpoints (dashboard + expense mutations).
- `client/src/features/admin/finance/FinancialDashboard.tsx` — date-range filter (This Month / Last Month / Last 30 / YTD / Custom), KPI cards (Revenue, COGS, Expenses, Net Profit), combined chronological transaction table, loading/error/empty states.
- `client/src/features/admin/finance/ExpenseModal.tsx` — add-expense modal with strict client-side validation (positive amount, valid category, no future date).

### 9.4 Wiring it in
1. Merge `finance.schema.prisma` into `prisma/schema.prisma`, add `expenses Expense[]` to the `User` model, then `npx prisma migrate dev --name add_finance`.
2. Mount routes in `app.ts`: `app.use('/api/finance', financeRoutes);`
3. Add `'Finance'` to your `apiSlice` `tagTypes`, and inject `financeApi`.
4. Route `FinancialDashboard` behind `RoleRoute('SUPER_ADMIN')` at e.g. `/admin/finance`.

### 9.5 Tests
The P&L math is extracted into a pure, DB-free module (`finance.calc.ts`) and covered by `finance.calc.test.ts` (Vitest, **13 tests, all passing**): gross/net profit, negative net profit (operating at a loss), zero-revenue divide-by-zero guard, decimal-rounding correctness, transaction merge/sort (revenue IN vs expense OUT), limit handling, and default/inclusive date ranges. Run with `npm test` in `/server` (config in `vitest.config.ts`).

### 9.6 DB-backed settings
Tax rate and delivery-fee config are stored in a key/value `Setting` table (not just env), editable by Super Admin via `PUT /api/settings/tax` and `PUT /api/settings/delivery-fee`; env values seed the defaults. Pricing/checkout read live values through `settings.service`. This is already wired in the codebase.

### 9.7 Security & correctness notes
- Both client **and** server validate `amount > 0`; the server is authoritative.
- The dashboard exposes cost/profit data, so every finance route is **Super-Admin-only** — consistent with the §5.0 RBAC matrix.
- Cancelled orders are excluded from revenue and COGS.
- `endDate` is treated as inclusive (extended to end-of-day) so boundary days aren't dropped.
