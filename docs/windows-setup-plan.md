# Plan: One-click Windows setup for restaurant owners

Status: approved 2026-11-11 (option 1)

## Goal

A restaurant owner with little technical knowledge receives the app folder,
double-clicks **`setup.bat` once**, answers two or three questions, and from then
on starts the app from a **"Restaurant App" icon on the desktop**. No Docker, no
terminal commands, no editing config files.

## Decision: how Node.js and PostgreSQL get installed

Chosen: **Option 1 – automatic install with winget** (Windows' built-in installer).

| Option | Pros | Cons |
| --- | --- | --- |
| **1. winget auto-install (chosen)** | Standard Windows installs; PostgreSQL runs as a service and starts with the PC; owner never types a database password | One admin "Yes" prompt; winget missing on very old Windows 10 (setup shows download links instead) |
| 2. Portable Node + PostgreSQL inside the app folder | No install, no admin prompt, delete folder to uninstall | ~350 MB download; antivirus may flag; not a real Windows install |
| 3. Owner installs both by hand with a picture guide | Simplest scripts | Hardest for low-tech owners; password to remember |

## Files

### `setup.bat` (run once)
1. Install Node.js LTS and PostgreSQL if missing (winget, one admin prompt).
   - New PostgreSQL install: setup generates the `postgres` superuser password
     itself and stores it in `server\.setup\` (owner never types it).
   - PostgreSQL already installed (developer PC): ask once for the `postgres` password.
2. Ask the owner for the **admin email and password** (replaces the public
   `superadmin123` demo login).
3. Ask **"Add a sample menu? (Y/N)"**.
4. Create the app's own database + database user with a random password.
5. Write `server\.env` (production mode, random JWT secrets).
6. `npm install` and **production build** of server and client.
7. Apply migrations, seed the owner's admin account (+ sample menu if chosen).
8. Create the **desktop shortcut** "Restaurant App" → `start.bat`.

### `start.bat` (behind the desktop icon)
- Make sure the PostgreSQL service is running.
- Start API (3001) and website (5173) in production mode in **one window**
  titled "Restaurant App – keep this window open".
- Open the browser; show the address for tablets on the same Wi-Fi.
- Plain-language error messages ("send a photo of this window to …").

### `stop.bat`
Stop the API and website (PostgreSQL service keeps running, as normal).

### `server/prisma/seed.ts`
- Use `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` when given.
- Add the sample menu only when `SEED_SAMPLE_MENU=yes` (default yes, for developers).
- Create the demo staff account (`staff123`) only when no custom admin is given.

### `HOW-TO-START.txt`
Three short steps, opens in Notepad.

### Removed
The Docker-based `start.bat` / `stop.bat` from earlier.

## Limits (tell owners)
- The app runs on **one PC** (`localhost`). Staff tablets on the same Wi-Fi can
  use the shown local address (Windows Firewall may ask to allow Node.js).
- **Customers cannot order over the internet** until the app is hosted on a
  server — a separate, later step.

## Testing
- Production build, migrations and the new seed options are run in the test
  workspace.
- `.bat` files cannot be executed there (no Windows); they are reviewed by hand
  and the first real run on Windows is the final test.
