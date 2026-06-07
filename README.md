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

The client is a single unified Next.js 14 app (App Router):
- **Public, SEO-critical pages** (`/`, `/menu`) are server-rendered with `generateMetadata`, JSON-LD structured data, ISR caching, and fetch the menu directly from the API on the server.
- **Authenticated/interactive pages** (cart, checkout, orders, login/register, all `/admin/*`) are client components (`'use client'`) backed by Redux Toolkit + RTK Query, gated by `useRequireAuth()` / `useRequireRole()` route guards.
- **SEO infrastructure**: `app/robots.ts`, `app/sitemap.ts`, and a dynamic `app/llms.txt` route (with AI-crawler allowlisting per the project plan §10.5) are generated automatically from live menu/category data.

See `restaurant-app-plan.md` §10 for the full migration rationale and SEO strategy.
