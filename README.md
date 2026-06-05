# Restaurant App

Full-stack restaurant application — React + Redux Toolkit (frontend) · Node.js/Express + PostgreSQL (backend).

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
Copy `server/.env` and adjust values as needed. Key vars:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — change before production
- `TAX_RATE` — default `0.07` (7%)

## Structure
```
restaurant-app/
├── client/          # Vite + React + Tailwind + Redux Toolkit
├── server/          # Express + TypeScript + Prisma + PostgreSQL
└── docker-compose.yml
```
