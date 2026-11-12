# Running the app inside the shop (local network) + later Cloudflare

Status: approved 2026-11-12 (Option A: everything local; D3 = script) · Branch: `main`

## Goal

Customers and staff open the website on the shop Wi-Fi. Customers scan the
table QR code and order; staff log in to the staff pages. No domain and no
internet hosting are needed. Orders keep working when the internet is down.

## Why this option

The restaurant is small and local. Running everything on one PC in the shop is
free and matches how `start.bat` already works. The trade-off: there is no
"staff Wi-Fi only" gate. Guests and staff share one network, so the staff pages
are protected by the login only. The Cloudflare section at the end describes
how to add that gate later.

## Facts checked (2026-11-12)

- Next.js installed: **16.4.6**. Its dev server blocks requests from other
  devices unless their host is listed in `allowedDevOrigins`
  (`client/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/allowedDevOrigins.md`).
  The shop must therefore run the production build (`next start`), not `npm run dev`.
- The API listens on all network interfaces (`server/src/server.ts`,
  `app.listen(env.port, ...)`), so other devices on the Wi-Fi can reach port 3001.
- `docker-compose.yml` publishes PostgreSQL as `'5432:5432'`, so other devices
  on the Wi-Fi can reach the database port.
- There is no way to change a password yet. Re-running the seed does not change
  existing passwords (`update: {}` in `server/prisma/seed.ts`), so the sample
  password `superadmin123` would stay.
- The browser only talks to the website (port 5173). Next.js forwards `/api`
  and `/uploads` to the API on the same PC (`client/next.config.js` rewrites).

## Decisions

| Decision | Choice |
| --- | --- |
| D1 Hosting | One PC in the shop runs the database, API and website. |
| D2 Network | Customers and staff on the same Wi-Fi (no guest isolation, or customers cannot reach the PC). Staff pages protected by login. |
| D3 Changing passwords | Command-line script `npm run set-password -- <username>` on the shop PC (chosen 2026-11-12). It also logs the user out on every device (`tokenVersion` + 1). An in-app "change password" page may come later with its own plan. |
| D4 Start script | New `start-shop.bat` for the shop (production build). `start.bat` stays for development. |

## Changes (code and config)

1. **Database only reachable from the PC**: `docker-compose.yml` port
   `'5432:5432'` → `'127.0.0.1:5432:5432'`.
2. **API only reachable from the PC**: new `HOST` setting (default
   `127.0.0.1`) in `server/src/config/env.ts`, used in `app.listen` in
   `server/src/server.ts`.
   - Default `API_ORIGIN` changes from `http://localhost:3001` to
     `http://127.0.0.1:3001` in `client/next.config.js` and
     `client/src/lib/api/server.ts`. Tested 2026-11-12 on the dev PC
     (Node 24.18.0): `localhost` resolves to `::1` first, but `fetch` falls
     back to `127.0.0.1` and still works. The change skips that failed IPv6
     attempt; it is not needed for correctness.
3. **`start-shop.bat`**: builds server and website, starts both with
   `npm start`, and prints the address to use (for example
   `http://192.168.1.10:5173`).
4. **`SITE_URL`** = `http://<PC-IP>:5173`. Step 1b's table QR codes use it.
5. **Password change**: `server/scripts/set-password.ts` +
   `"set-password"` script in `server/package.json` (see D3).
6. **README**: new section "Running in the shop" with the setup steps below.

## Setup in the shop (no code)

1. Router: give the PC a fixed IP (DHCP reservation), so printed QR codes keep working.
2. Windows: set the network profile to **Private**; firewall rule allowing only
   TCP 5173 inbound.
3. Windows: turn off sleep on the PC.
4. Wi-Fi: customers and staff on the same network. Use WPA3 if the router
   supports it (see Risks).
5. Print one sticker per table: Wi-Fi QR + table QR.
6. Change both Super Admin passwords (`superadmin`, `admin`) before opening.

## Tests

- On this PC: production build + start; site loads at `http://127.0.0.1:5173`
  and at the PC's LAN IP; login works; ports 3001 and 5432 refuse connections
  on the LAN IP.
- In the shop (needs a phone): on the shop Wi-Fi the site loads and login
  works; `:3001` and `:5432` fail; after a PC restart the IP is unchanged.

## Risks

- **Plain `http` on a shared Wi-Fi.** Someone on the same Wi-Fi with the right
  tools can read a staff login or session token (see "How a password can be
  captured" below). Low risk for a small shop, not zero. Real fix: HTTPS, which
  comes with the Cloudflare step.
- **One PC runs everything.** If it is off or crashes, nobody can order.
- **The PC's IP changes.** Every printed QR code breaks. Prevented by setup step 1.
- **"Use my location" at checkout** (`navigator.geolocation`) only works on
  `https` or `localhost`, so it does not work from phones on
  `http://<PC-IP>`. Only matters for delivery orders; table orders do not use it.
- **Several network adapters.** Unplugged or VPN adapters can keep an old
  address. `start-shop.bat` therefore lists only connected adapters with a
  default gateway (found 2026-11-12: a disconnected USB-tethering adapter still
  had `192.168.3.145`).

### How a password can be captured on shared Wi-Fi

- **Reading the air (WPA2-Personal):** everyone who knows the Wi-Fi password
  can work out the encryption keys of another device if they record the moment
  it joins the Wi-Fi. With `http`, the login request then shows username and
  password in plain text. WPA3-Personal stops this.
- **Man in the middle (ARP spoofing):** a laptop on the same network tells the
  other devices "I am the router" or "I am the PC", so their traffic passes
  through it. WPA3 does not stop this; only HTTPS (or client isolation) does.
- **Fake Wi-Fi (evil twin):** a hotspot with the same name; devices that join
  it send everything through the attacker.

Limits on the damage today: access tokens expire after 15 minutes; the refresh
token lasts 7 days, so a captured refresh token is worth more than an access
token.

## Later: Cloudflare (when the restaurant expands)

When: customers should order on mobile data, online pickup/delivery is wanted,
or the staff Wi-Fi should be separate from the customer Wi-Fi again.

1. Buy a domain; move its DNS to Cloudflare.
2. Install `cloudflared` on the PC as a Windows service; named tunnel
   `order.<domain>` → `http://127.0.0.1:5173`. No open port on the router.
3. `SITE_URL` → `https://order.<domain>`; **reprint the QR codes once** (the
   address changes, so this cannot be avoided).
4. Staff side, one of:
   - the server rejects `/admin` pages and staff API requests that arrive
     through the tunnel; staff keep using the local address on the staff Wi-Fi;
   - or Cloudflare Access with an email login in front of `/admin` (free-tier
     limits to be checked then).
5. Turn on a guest Wi-Fi with isolation. Customers order over the internet,
   staff Wi-Fi is separate. HTTPS fixes the password-capture risk above.
6. Several branches: one PC cannot serve several shops. Move to a cloud server
   and managed PostgreSQL; separate plan.
