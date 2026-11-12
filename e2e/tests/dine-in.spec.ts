import { test, expect, request, devices, type APIRequestContext, type Page } from '@playwright/test';

// Dine-in end to end (Step 1): a guest orders from the table's QR page in two
// rounds, the kitchen cooks, staff close the bill on the floor view, and the
// table's QR code then starts a new, empty bill.
// Runs against the running app with the seeded admin (see order-flow.spec.ts).
const ADMIN = { username: process.env.E2E_ADMIN_USERNAME || 'superadmin', password: process.env.E2E_ADMIN_PASSWORD || 'superadmin123' };
const API = process.env.E2E_API_URL || 'http://localhost:3001';
const LABEL = `E2E${String(Date.now()).slice(-6)}`; // table names are max 12 characters

let api: APIRequestContext;
let auth: Record<string, string> = {};
let zoneId = '';
let qrToken = '';
let hoursWereEnforced = true;

test.beforeAll(async () => {
  api = await request.newContext({ baseURL: API });
  const login = await api.post('/api/auth/login', { data: ADMIN });
  expect(login.ok(), 'admin login').toBeTruthy();
  auth = { authorization: `Bearer ${(await login.json()).accessToken}` };
  // Works at any time of day: opening hours off for the run.
  hoursWereEnforced = (await (await api.get('/api/settings', { headers: auth })).json()).ORDERING_HOURS_ENFORCED !== 0;
  await api.put('/api/settings/ordering', { data: { hoursEnforced: false }, headers: auth });

  // A zone with one table, just for this run.
  const zone = await api.post('/api/tables/zones', { data: { name: `E2E zone ${LABEL}`, width: 8, height: 6 }, headers: auth });
  expect(zone.ok(), 'create zone').toBeTruthy();
  zoneId = (await zone.json()).id;
  const layout = await api.put(`/api/tables/zones/${zoneId}/layout`, {
    data: { tables: [{ label: LABEL, shape: 'SQUARE', seats: 4, x: 1, y: 1, width: 2, height: 2, rotation: 0 }], decor: [] },
    headers: auth,
  });
  expect(layout.ok(), 'save layout').toBeTruthy();
  const codes = (await (await api.get('/api/tables/qr-codes', { headers: auth })).json()) as { tables: { label: string; qrToken: string }[] }[];
  qrToken = codes.flatMap((z) => z.tables).find((t) => t.label === LABEL)!.qrToken;
  expect(qrToken).toBeTruthy();
});

test.afterAll(async () => {
  await api.put('/api/settings/ordering', { data: { hoursEnforced: hoursWereEnforced }, headers: auth });
  if (zoneId) await api.delete(`/api/tables/zones/${zoneId}`, { headers: auth });
  await api.dispose();
});

async function signIn(page: Page) {
  await page.goto('/login');
  await page.locator('input[autocomplete="username"]').fill(ADMIN.username);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/en$/);
}

/** Guest adds the first dish on the menu (choosing options if it has any) and sends the round. */
async function orderRound(guest: Page) {
  await guest.getByRole('button', { name: /^Add / }).first().click();
  const options = guest.getByRole('dialog');
  if (await options.isVisible().catch(() => false)) await options.getByRole('button', { name: /add/i }).last().click();
  await guest.getByRole('button', { name: 'Review order' }).click();
  await guest.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(guest.getByText('Sent to the kitchen').first()).toBeVisible();
}

test('guest orders at the table, kitchen cooks, staff close the bill, the QR code starts a new bill', async ({ page, browser }) => {
  // --- Guest at the table (phone, no account) ------------------------------
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  const guest = await phone.newPage();
  await guest.goto(`/en/t/${qrToken}`);
  await expect(guest.getByRole('heading', { name: `Table ${LABEL}` })).toBeVisible();
  await orderRound(guest);
  await expect(guest.getByRole('heading', { name: 'Your table' })).toBeVisible();
  // First order waits for staff (banner; the toast says it too).
  await expect(guest.getByText(/confirm your table in a moment/)).toBeVisible();
  await orderRound(guest); // a second round on the same bill
  await expect(guest.getByText('Order 2')).toBeVisible();

  // --- Kitchen: accept and finish both rounds -------------------------------
  await signIn(page);
  await page.goto('/en/kitchen');
  const tickets = page.locator('article', { hasText: `Table ${LABEL}` });
  await expect(tickets).toHaveCount(2);
  await expect(tickets.first().getByText('New table')).toBeVisible();
  // Each box has one button: Accept order → Done → Served.
  const withButton = (name: string) => tickets.filter({ has: page.getByRole('button', { name, exact: true }) });
  for (let left = 2; left > 0; left--) {
    await withButton('Accept order').first().getByRole('button', { name: 'Accept order' }).click();
    await expect(withButton('Accept order')).toHaveCount(left - 1);
  }
  await expect(withButton('Done')).toHaveCount(2);
  await withButton('Done').first().getByRole('button', { name: 'Done' }).click();
  await withButton('Served').getByRole('button', { name: 'Served' }).click();
  await expect(tickets).toHaveCount(1); // the served round leaves the kitchen

  // Accepting confirmed the table: the guest's notice goes away.
  await expect(guest.getByText(/confirm your table/)).toBeHidden({ timeout: 20_000 });

  // --- Guest asks for the bill ----------------------------------------------
  await guest.getByRole('button', { name: 'Request the bill' }).click();
  await guest.getByRole('dialog', { name: 'Request the bill?' }).getByRole('button', { name: 'Request the bill' }).click();
  await expect(guest.getByText(/bill is on its way/)).toBeVisible();

  // --- Staff close the bill on the floor view -------------------------------
  await page.goto('/en/admin/floor');
  await page.getByRole('tab', { name: new RegExp(`E2E zone ${LABEL}`) }).click();
  await page.getByRole('button', { name: new RegExp(`Table ${LABEL}, Bill requested`) }).click();
  await page.getByRole('button', { name: /^Bill & payment/ }).click();
  const bill = page.getByRole('dialog', { name: new RegExp(`Bill · Table ${LABEL}`) });
  await bill.getByLabel('Cash received').fill('1000');
  await expect(bill.getByText(/^Change:/)).toBeVisible();
  await bill.getByRole('button', { name: /^Paid / }).click();
  // The second round is still cooking: staff confirm serving it with the payment.
  await page.getByRole('dialog', { name: 'Not everything is served' }).getByRole('button', { name: 'Mark served and close bill' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`Table ${LABEL}, Needs cleaning`) })).toBeVisible();
  await page.getByRole('button', { name: 'Table is clean' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`Table ${LABEL}, Free`) })).toBeVisible();

  // --- The guest's page says thank you; the QR code now starts a new bill --
  await expect(guest.getByText('Thank you!')).toBeVisible({ timeout: 20_000 });
  const join = await (await api.post(`/api/dine-in/t/${qrToken}/join`)).json();
  expect(join.visit).toBeNull();
  await phone.close();
});
