# Restaurant App

Full-stack restaurant application — Next.js + Redux Toolkit (frontend, SSR/SEO-optimized) · Node.js/Express + PostgreSQL (backend).

## Quick start

### 1. Start the database
```bash
docker-compose up -d
```

### 2. Backend setup
```bash
cd server
npm install
npx prisma migrate dev --name init
npm run db:seed       # creates admin + sample menu
npm run dev           # http://localhost:3001
```

### 3. Frontend setup
```bash
cd client
npm install
npm run dev           # http://localhost:5173
```

## Environment

### Backend (`server/.env`)
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — change before production
- `TAX_RATE` — default `0.07` (7%)
- `BUSINESS_TIMEZONE` — default `Asia/Bangkok`; business day, daily order numbers and opening hours use it
- `SEED_SUPERADMIN_PASSWORD` / `SEED_ADMIN_PASSWORD` — optional passwords for the sample accounts (the seed refuses to run with `NODE_ENV=production` unless `ALLOW_SEED=1`)

### Frontend (`client/.env.local`)
- `SITE_URL` — canonical site URL used for metadata, sitemap, robots, JSON-LD (default `http://localhost:5173`)
- `API_ORIGIN` — backend origin the Next.js rewrites/server fetches proxy to (default `http://localhost:3001`)

## Structure
```
restaurant-app/
├── client/          # Next.js (App Router) + Tailwind + Redux Toolkit — SSR public pages, SPA-style auth/cart/admin
├── server/          # Express + TypeScript + Prisma + PostgreSQL
└── docker-compose.yml
```

## Frontend architecture (Next.js)

The client is a single unified Next.js 16 app (App Router, React 18):
- **Public, SEO-critical pages** (`/`, `/menu`) are server-rendered with `generateMetadata`, JSON-LD structured data, ISR caching, and fetch the menu directly from the API on the server.
- **Authenticated/interactive pages** (cart, checkout, orders, login/register, all `/admin/*`) are client components (`'use client'`) backed by Redux Toolkit + RTK Query, gated by `useRequireAuth()` / `useRequireRole()` route guards.
- **SEO infrastructure**: `app/robots.ts`, `app/sitemap.ts`, and a dynamic `app/llms.txt` route (with AI-crawler allowlisting per the project plan §10.5) are generated automatically from live menu/category data.

See [`docs/restaurant-app-plan.md`](docs/restaurant-app-plan.md) §10 for the full migration rationale and SEO strategy.

## Order workflow (Phase 0)

`PENDING → PREPARING → READY → (OUT_FOR_DELIVERY →) DELIVERED`, or `CANCELLED` with a reason.
The server enforces it (`server/src/modules/orders/orderStateMachine.ts`); see
[`docs/phase-0-stabilize.md`](docs/phase-0-stabilize.md) for the full Phase 0 plan.

- Orders are only accepted during the opening hours in the restaurant profile.
  Switch this off under **Admin → Settings → Online Ordering** for testing at night.
- Staff accounts are deactivated, never deleted.

## Sign-in

Everyone signs in with a **username** and password. Customers also give an email when
they register; for staff accounts the email is optional.

`npm run db:seed` creates two Super Admin logins for local development:

| Username     | Password        |
|--------------|-----------------|
| `superadmin` | `superadmin123` |
| `admin`      | `superadmin123` |

These passwords are public. Change them (or set `SEED_SUPERADMIN_PASSWORD` /
`SEED_ADMIN_PASSWORD` before seeding) before the app is reachable from other devices.

Users created before the username change got a username from the part of their email
before `@` (lowercased, other characters removed, a number added on clashes), e.g.
`superadmin@restaurant.com` → `superadmin`.

### Updating an existing install

New packages and database changes come with each phase. After pulling:

```bash
cd server
npm install            # installs new packages and regenerates the Prisma client (postinstall)
npx prisma migrate deploy
```

## Tests

```bash
cd server && npm test            # unit tests (Vitest)

# End-to-end (Playwright) against the running app (API :3001, website :5173)
cd e2e
npm install
npx playwright install chromium  # first time only
npm test
```

GitHub Actions (`.github/workflows/ci.yml`) runs the type checks, unit tests, a production build and the end-to-end tests on every push.
