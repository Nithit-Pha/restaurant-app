# Phase 1 — Real orders

Status: approved 2026-11-11 · Branch: `phase-1-real-orders`
Source: product review "Restaurant App — Product & Feature Discovery" (Claude doc), roadmap §9, Phase 1.

## Goal

A pilot restaurant takes **paid** orders without workarounds.

**Gate to Phase 2:** a pilot restaurant takes paid orders for 2 weeks without workarounds.

Already done earlier, so not part of this phase: opening hours and the "closed now" banner
(Phase 0), delivery fee from the restaurant's location (`3b908ae`), Asia/Bangkok business day
on the server (Phase 0).

## Decisions (approved)

| Decision | Choice |
| --- | --- |
| Payments | Cash (at pickup / on delivery) and the restaurant's own PromptPay QR, confirmed by staff with **Mark paid**. Card / gateway payments later, behind the same `Payment` model. |
| Revenue | `DELIVERED` **and** `PAID`. Existing orders: `DELIVERED` → `PAID`, everything else → `UNPAID`. |
| Map | Leaflet + OpenStreetMap tiles: draggable pin + typed address, no address search. |
| Languages | English main (default URL `/en`), Thai optional (`/th`). Menu items get optional `nameTh` / `descriptionTh` that fall back to English. |
| New dependencies | `qrcode` (QR image), `react-leaflet` + `leaflet` (map), `next-intl` (translations). PromptPay payload (EMVCo + CRC16) is our own small function. |
| Way of working | One slice at a time: code + tests + commit, report, wait for OK before the next. |

## Slices (in this order)

### 1a — THB + Bangkok time (S)
- `client/src/lib/format.ts`: currency THB (฿), dates shown in `Asia/Bangkok`.
- Check the 9 files that use it and any hard-coded `$`.

### 1b — Payments (L)
- DB: `PaymentMethod` (`CASH`, `PROMPTPAY`), `PaymentStatus` (`UNPAID`, `PENDING`, `PAID`, `REFUNDED`);
  `Payment` (orderId, method, status, amount, providerRef?, confirmedById?, paidAt?, createdAt);
  `Order.paymentMethod`, `Order.paymentStatus`. Backfill as in Decisions.
- Server: method chosen at checkout; `POST /orders/:id/mark-paid` (staff) writes the payment and
  audit log; PromptPay payload built from the new `PROMPTPAY_ID` setting (phone or tax ID) and the
  order total; revenue = `DELIVERED` and `PAID` in finance.
- Client: payment choice at checkout; QR + amount on the customer's order page; payment badge and
  **Mark paid** on the staff orders page; PromptPay ID in Settings.

### 1c — Busy mode (S)
- Setting `ORDERING_MODE`: `NORMAL`, `BUSY` (+N minutes, `BUSY_EXTRA_MINUTES`), `PAUSED` (no new
  orders, with a message).
- Toggle on the staff orders page; shown at checkout and on the menu banner; server rejects new
  orders while paused (`409`).

### 1d — Item options + notes (L)
- DB: `ModifierGroup` (menuItemId, name, minSelect, maxSelect, sortOrder), `Modifier` (groupId,
  name, priceDelta, isAvailable, sortOrder), `OrderItemModifier` (orderItemId, name and price
  snapshot), `OrderItem.note`.
- Server prices options itself and validates min/max; options and notes in order responses.
- Client: options editor in admin menu; options dialog on the menu page; cart line = item +
  options + note (existing carts reset once); kitchen rows show options and notes.

### 1e — Map pin + saved addresses (M)
- DB: `Address` (userId, label, text, lat, lng, note).
- Server: CRUD for the customer's own addresses.
- Client: Leaflet map with a draggable pin at checkout; pick a saved address or save a new one;
  delivery fee from the pin.

### 1f — Thai / English (L)
- `next-intl`, locale in the URL (`/en/...`, `/th/...`), old URLs redirect to `/en/...`.
- All UI text in `messages/en.json` and `messages/th.json`; language switcher.
- `MenuItem.nameTh`, `MenuItem.descriptionTh` (fallback to English); `User.locale`.
- `hreflang` alternates, sitemap per locale.

## Tests

- Unit (Vitest): PromptPay payload + CRC, payment state changes, busy mode, option pricing and
  min/max validation.
- End-to-end (Playwright): PromptPay order marked paid; order with options and a note; delivery to
  a pinned address; language switch.
- Vitest and e2e after every slice.

## Risks

- PromptPay is confirmed by hand: staff must check the bank app before **Mark paid**.
- i18n moves every page under `/en` or `/th`: touches all pages and SEO URLs (old URLs redirect).
- Options change the cart shape: existing browser carts reset once.
- Phase 0's gate asks for e2e passing in **CI**; so far it has only been run locally.
