# UI redesign — warm, calm, professional

Status: done 2026-11-12 (slices 1–6) · approved 2026-11-11 · Branch: `ui-redesign` (from `phase-1-real-orders` after Phase 1b)
Brief: "Senior Product Designer" redesign prompt (warm, comfortable, not AI-looking).

## Goal

The whole app looks and feels like one carefully made restaurant product: warm and welcoming
for customers, quick and calm for staff during busy hours. No business logic, API, route or
feature is removed.

## Decisions (approved)

| Decision | Choice |
| --- | --- |
| Timing | Now, on its own branch, before Phase 1c–1e. New Phase 1 screens use the new components. |
| Font | IBM Plex Sans + IBM Plex Sans Thai, self-hosted from npm (`@fontsource/*`), so it works offline and in CI. |
| Colour | Warm minimal: ivory, warm gray, muted olive accent, natural status colours. |
| Navigation | A left sidebar for every page (customer and staff). On phones and small tablets it becomes a drawer opened from a slim top bar that also holds the cart. |
| Icons | Lucide (`lucide-react`), stroke 1.75, sizes 16 / 20. No emoji anywhere in the UI. |
| New dependencies | `lucide-react`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-sans-thai`. No component library. |
| Way of working | One slice at a time: code + checks + commit, report, wait for OK. |

## Design system

### Colour tokens

CSS variables in `client/app/globals.css` (RGB channels), mapped to Tailwind names. Light and
dark are switched only by the variables.

| Token | Use | Light | Dark |
| --- | --- | --- | --- |
| `canvas` | page background | `#F6F3EC` | `#1B1A17` |
| `surface` | cards, sidebar, dialogs | `#FCFAF6` | `#24221F` |
| `surface-muted` | sunken areas, table header | `#EEEAE1` | `#2C2A26` |
| `surface-hover` | row / item hover | `#E9E4DA` | `#312E2A` |
| `line` | card borders, dividers | `#E2DCD0` | `#3A3631` |
| `line-strong` | input borders (≥ 3:1) | `#958C7E` | `#777166` |
| `fg` | main text | `#2B2925` | `#ECE7DE` |
| `fg-muted` | secondary text | `#6B655B` | `#A8A196` |
| `fg-subtle` | icons, placeholders only | `#857E72` | `#8C8579` |
| `accent` | primary buttons, active nav | `#5C6B3C` olive | `#A9B57E` |
| `accent-hover` | | `#4D5A32` | `#B8C38E` |
| `accent-soft` | active nav background | `#E6E9DA` | `#333A27` |
| `accent-fg` | text on accent | `#FFFFFF` | `#1B1A17` |
| `success` / soft | Ready, paid | `#356B4B` / `#DCEBE1` | `#86C49C` / `#22362A` |
| `warning` / soft | New, waiting long | `#8F5B10` / `#F5E8CF` | `#E0AE5E` / `#3A2F1C` |
| `danger` / soft | Cancelled, destructive | `#A63D32` / `#F5DEDA` | `#E8907F` / `#3D2522` |
| `info` / soft | Preparing, on the way | `#46617F` / `#DFE6EE` | `#98B2D1` / `#243040` |
| `neutral` / soft | Delivered, inactive | `#5F5950` / `#EAE6DD` | `#BDB6AA` / `#34312C` |

All text pairings were checked: body and muted text ≥ 4.8:1, status text on its soft
background ≥ 4.7:1, button text on accent ≥ 5.8:1 (WCAG AA).

Until each page is restyled, Tailwind's `gray` and `brand` scales are remapped to the warm
grays and olive, so untouched pages already match.

### Order statuses

Dot + label, soft background. New = warning, Preparing = info, Ready = success,
Out for delivery = info, Delivered = neutral, Cancelled = danger.

### Typography

IBM Plex Sans (Latin) with IBM Plex Sans Thai, weights 400 / 500 / 600.
Scale (px): 12, 14, 16, 18, 20, 24, 30. Staff pages body 14, customer pages 15–16.
Prices, order numbers and table numbers use tabular figures (`tabular-nums`).

### Spacing, radius, elevation, motion

- 4 px grid (Tailwind default scale).
- Radius: 6 px controls, 10 px cards, 14 px dialogs and drawers.
- Shadows: `shadow-soft` (cards on hover, menus), `shadow-raised` (dialogs, drawers), warm-tinted.
  In dark mode elevation comes from lighter surfaces.
- Motion: 150–200 ms ease-out fades and slides; no bounce or glow; off with
  `prefers-reduced-motion`.
- Touch targets ≥ 40 px on staff action buttons and the cart stepper.

### Breakpoints

Tailwind defaults. Sidebar fixed from `lg` (1024 px); below that a top bar + drawer.

### Components (`client/src/components/ui/`)

Button (primary, secondary, ghost, danger · sm / md / lg · loading · disabled), IconButton,
Field + Input / Select / Textarea (label, hint, error, required marker), Card, Badge,
StatusBadge, Table pieces, Dialog, Drawer, Toast, EmptyState, Spinner, Skeleton,
PageHeader, Tabs / SegmentedControl.

## Navigation

One app shell with a left sidebar:

- Top: restaurant name (from Settings).
- **Order**: Home, Menu, My orders (signed in).
- **Service** (staff): Orders (with count of new orders), Menu management.
- **Business** (super admin): Finance, Audit log, Settings.
- Bottom: Cart (with count), theme switch, account (name, role, sign out) or Sign in.
- Active page highlighted (accent-soft background + accent text).
- Below `lg`: slim top bar (menu button, restaurant name, cart) and the sidebar as a drawer.

## Slices

1. **Foundation** — tokens, fonts, Tailwind config, Lucide, shared components, hidden
   `/dev/design` preview page (noindex, not in sitemap).
2. **App shell and navigation** — left sidebar, mobile drawer, theme switch and cart moved into
   it, all emoji removed.
3. **Staff orders screen** — status chips with counts, one large next-step button per row,
   waiting-time colour, sticky toolbar, Bell / BellOff sound toggle.
4. **Customer pages** — home, menu, cart drawer, checkout, order list, order tracking
   (timeline, PromptPay panel), login, register.
5. **Admin pages** — menu management, finance, audit log, settings in clear sections.
6. **Checks** — screenshots of every page, light and dark, at 375 / 768 / 1280 px; contrast,
   keyboard focus, reduced motion; type check, build, Vitest, e2e; brief §10 checklist.

## Not changing

API calls, Redux / RTK Query, the order workflow, routes, SEO (JSON-LD, menu microdata,
sitemap, robots, llms.txt). Visible labels the e2e test relies on stay ("Menu", "Add",
"Open cart", "Checkout", "Accept", "Mark ready", …) or the test is updated in the same slice.

## Results (slice 6, 2026-11-12)

Checks run:

- Client: type check and production build pass.
- Server: unit tests pass (106 / 106). The server code was not changed by the redesign.
- Accessibility: axe-core (WCAG 2.0 / 2.1 A and AA plus best practices) on 38 page states —
  every page, light and dark, signed in and out, plus the cart drawer, checkout and the
  dialogs: 0 violations after the fixes below.
- Keyboard: "Skip to content" is the first Tab stop; every focused control shows a focus ring;
  dialogs take focus, keep it inside, close with Escape and return focus to the button that
  opened them; order rows open by keyboard.
- Reduced motion: animations drop to 1 ms when the device asks for less motion.
- Contrast: every text token pair meets AA (body and muted text ≥ 4.8:1, status text on its
  soft background ≥ 4.7:1, button text ≥ 5.8:1).

Fixed in slice 6:

- Dialogs that open on first render now take keyboard focus and trap it (they set up their
  keyboard handling before the panel existed).
- Order row details open from a real button with `aria-expanded` (it was on the table row,
  where assistive tech ignores it).
- Sidebar group labels and audit-log ids used the icon-only grey (3.85:1); now muted text.
- Menu item names are h2 under the page's h1 (they jumped to h3).
- The orders date picker shows a focus ring on its visible label.
- The theme button keeps one name ("Dark theme") and reports on/off with `aria-pressed`.
- Removed the temporary `gray` / `brand` colour remap (no page uses them any more).

Not run here: the Playwright end-to-end test. It needs the API, and the Prisma engine
download (binaries.prisma.sh) is blocked in the build environment. It runs in CI on push, or
locally after `start.bat` with `cd e2e && npm test`. Every text, label and button it relies
on was kept.

Brief §10 checklist:

| Question | Answer |
| --- | --- |
| Professional restaurant application? | Yes: one sidebar shell, consistent cards, tables and dialogs; restaurant-specific screens (orders, menu, payments). |
| Comfortable rather than exhausting? | Warm ivory / graphite, one muted olive accent, no gradients or glow, quiet motion. |
| Colours balanced and consistent? | One accent; four muted status hues plus neutral, used the same way everywhere. |
| Icons professional and consistent? | Lucide only, one stroke width, two sizes, text labels on actions. |
| Any emoji or decorative element? | None in the UI (checked by search). |
| Clear information hierarchy? | One h1 per page, PageHeader everywhere, one primary action per area. |
| Usable quickly in busy hours? | Status chips with counts, one big next-step button per order, waiting-time colours, chime, toasts. |
| Tables, forms, dashboards readable? | Tabular numbers, aligned money columns, labelled fields with hint / error. |
| Light and dark equally designed? | Same tokens, separately tuned; axe and contrast checks pass in both. |
| One cohesive product? | All pages use the same components; no page-specific colours left. |
