import { test, expect, request, type APIRequestContext, type Page } from '@playwright/test';

// Seeded admin account (server/prisma/seed.ts). Override in CI with env vars.
const ADMIN = { username: process.env.E2E_ADMIN_USERNAME || 'superadmin', password: process.env.E2E_ADMIN_PASSWORD || 'superadmin123' };
// No staff account is seeded: the run creates its own and deactivates it afterwards.
const STAFF = { username: `e2e-staff-${Date.now()}`, password: 'password123' };
const API = process.env.E2E_API_URL || 'http://localhost:3001';

let api: APIRequestContext;
let adminToken = '';
let staffId = '';
let hoursWereEnforced = true;
let paymentSettingsBefore: { promptPayId: string; promptPayName: string } | null = null;

// The test must work at any time of day, so switch off the opening-hours
// rule for the run and restore it afterwards.
test.beforeAll(async () => {
  api = await request.newContext({ baseURL: API });
  const login = await api.post('/api/auth/login', { data: ADMIN });
  expect(login.ok(), 'admin login').toBeTruthy();
  adminToken = (await login.json()).accessToken;
  const auth = { authorization: `Bearer ${adminToken}` };
  const settings = await (await api.get('/api/settings', { headers: auth })).json();
  hoursWereEnforced = settings.ORDERING_HOURS_ENFORCED !== 0;
  await api.put('/api/settings/ordering', { data: { hoursEnforced: false }, headers: auth });

  const staff = await api.post('/api/admin/staff', { data: { name: 'E2E Staff', ...STAFF, role: 'STAFF' }, headers: auth });
  expect(staff.ok(), 'create staff').toBeTruthy();
  staffId = (await staff.json()).id;

  // Offer PromptPay for the run; the previous account is restored afterwards.
  paymentSettingsBefore = await (await api.get('/api/settings/payment', { headers: auth })).json();
  const pp = await api.put('/api/settings/payment', { data: { promptPayId: '0812345678', promptPayName: 'E2E Shop' }, headers: auth });
  expect(pp.ok(), 'set PromptPay').toBeTruthy();
});

test.afterAll(async () => {
  const auth = { authorization: `Bearer ${adminToken}` };
  await api.put('/api/settings/ordering', { data: { hoursEnforced: hoursWereEnforced }, headers: auth });
  if (paymentSettingsBefore) await api.put('/api/settings/payment', { data: paymentSettingsBefore, headers: auth });
  await api.put('/api/settings/busy', { data: { mode: 'NORMAL' }, headers: auth }); // never leave ordering paused
  if (staffId) await api.delete(`/api/admin/staff/${staffId}`, { headers: auth });
  await api.dispose();
});

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
}

async function addFirstItemAndCheckout(page: Page) {
  // Client-side navigation keeps the cart in memory.
  await page.getByRole('link', { name: 'Menu', exact: true }).first().click();
  await expect(page).toHaveURL(/\/menu/);
  await page.getByRole('button', { name: 'Add' }).first().click();
  // Adding usually opens the cart drawer; open it if it did not.
  const checkout = page.getByRole('link', { name: 'Checkout' });
  if (!(await checkout.isVisible())) await page.getByRole('button', { name: 'Open cart' }).click();
  await checkout.click();
  await expect(page).toHaveURL(/\/checkout/);
}

test('customer orders for pickup, staff complete it, customer sees it completed', async ({ page, browser }) => {
  // --- Customer registers and orders ------------------------------------
  const username = `e2e-${Date.now()}`;
  await page.goto('/register');
  await page.locator('form input').first().fill('E2E Customer');
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[type="email"]').fill(`${username}@example.com`);
  await page.locator('input[type="password"]').fill('password123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);

  await addFirstItemAndCheckout(page);

  const placeOrder = page.getByRole('button', { name: /Place order/ });
  await expect(placeOrder).toBeDisabled(); // no phone yet
  await page.getByLabel('Phone number').fill('081 234 5678');
  await expect(placeOrder).toBeEnabled();
  await placeOrder.click();

  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Waiting for the restaurant').first()).toBeVisible();
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  const orderNumber = heading!.replace('Order ', '').trim(); // e.g. "#004"
  expect(orderNumber).toMatch(/^#\d{3,}$/);
  const orderUrl = page.url();

  // --- Staff work the order through the kitchen ---------------------------
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await signIn(staff, STAFF.username, STAFF.password);
  await staff.goto('/admin/orders');
  const row = staff.locator('tr', { hasText: orderNumber });
  await expect(row).toBeVisible();
  await expect(row.getByText('New')).toBeVisible();

  // Expand: items and the phone are visible to the kitchen.
  await row.click();
  await expect(staff.getByRole('link', { name: '081 234 5678' })).toBeVisible();

  await row.getByRole('button', { name: 'Accept' }).click();
  await staff.getByRole('button', { name: '20 min' }).click();
  await staff.getByRole('button', { name: /Accept · ready in 20 min/ }).click();
  await expect(row.getByText('Preparing')).toBeVisible();

  // The customer now sees an ETA.
  await page.goto(orderUrl);
  await expect(page.getByText('Estimated ready at')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0); // too late to cancel

  await row.getByRole('button', { name: 'Mark ready' }).click();
  await expect(row.getByText('Ready', { exact: true })).toBeVisible();
  // Completing an unpaid cash order asks for the cash in the same step (ticked by default).
  await expect(row.getByText('Cash · Unpaid')).toBeVisible();
  await row.getByRole('button', { name: 'Picked up' }).click();
  await expect(staff.getByRole('checkbox', { name: /Cash received/ })).toBeChecked();
  await staff.getByRole('button', { name: 'Picked up · cash received' }).click();
  await expect(row.getByText('Completed')).toBeVisible();
  await expect(row.getByRole('button', { name: /Accept|Mark ready|Picked up/ })).toHaveCount(0);
  await expect(row.getByText('Cash · Paid')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Mark paid' })).toHaveCount(0);
  await staffContext.close();

  // --- Customer sees the final status -------------------------------------
  await page.reload();
  await expect(page.getByText('Completed').first()).toBeVisible();
  await expect(page.getByText('Paid. Thank you!')).toBeVisible();
});

test('customer pays by PromptPay QR, staff confirm the transfer', async ({ page, browser }) => {
  const username = `e2e-pp-${Date.now()}`;
  await page.goto('/register');
  await page.locator('form input').first().fill('E2E PromptPay');
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[type="email"]').fill(`${username}@example.com`);
  await page.locator('input[type="password"]').fill('password123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);

  await addFirstItemAndCheckout(page);
  await page.getByRole('radio', { name: /PromptPay QR/ }).check();
  await page.getByLabel('Phone number').fill('0811111111');
  await page.getByRole('button', { name: /Place order/ }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  const orderNumber = (await page.getByRole('heading', { level: 1 }).textContent())!.replace('Order ', '').trim();

  // The QR with the exact amount, then "I've transferred".
  await expect(page.getByAltText(/PromptPay QR code for ฿/)).toBeVisible();
  await expect(page.getByText('E2E Shop')).toBeVisible();
  await page.getByRole('button', { name: "I've transferred the money" }).click();
  await expect(page.getByText('The restaurant is checking your transfer.')).toBeVisible();

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await signIn(staff, STAFF.username, STAFF.password);
  await staff.goto('/admin/orders');
  const row = staff.locator('tr', { hasText: orderNumber });
  await expect(row.getByText('PromptPay · Check transfer')).toBeVisible();
  await row.getByRole('button', { name: 'Check transfer' }).click();
  await staff.getByLabel('Transfer reference').fill('E2E-REF-1');
  await staff.getByRole('button', { name: 'Transfer received' }).click();
  await expect(row.getByText('PromptPay · Paid')).toBeVisible();
  await staffContext.close();

  await page.reload();
  await expect(page.getByText('Payment received. Thank you!')).toBeVisible();
});

test('customer can cancel while the order is still waiting; staff see why', async ({ page, browser }) => {
  const username = `e2e-cancel-${Date.now()}`;
  await page.goto('/register');
  await page.locator('form input').first().fill('E2E Canceller');
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[type="email"]').fill(`${username}@example.com`);
  await page.locator('input[type="password"]').fill('password123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);

  await addFirstItemAndCheckout(page);
  await page.getByLabel('Phone number').fill('0899999999');
  await page.getByRole('button', { name: /Place order/ }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  const orderNumber = (await page.getByRole('heading', { level: 1 }).textContent())!.replace('Order ', '').trim();

  await page.getByRole('button', { name: 'Cancel order' }).click();
  await page.getByRole('button', { name: 'Yes, cancel' }).click();
  await expect(page.getByText('This order was cancelled.')).toBeVisible();
  await expect(page.getByText('Customer asked to cancel')).toBeVisible();

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await signIn(staff, STAFF.username, STAFF.password);
  await staff.goto('/admin/orders');
  const row = staff.locator('tr', { hasText: orderNumber });
  await expect(row.getByText('Cancelled')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await staffContext.close();
});

test('customer orders a dish with options and a note; the kitchen sees both', async ({ page, browser, baseURL }) => {
  // A dish of its own, so the other tests (which add the first dish) are not affected.
  const auth = { authorization: `Bearer ${adminToken}` };
  const dish = `E2E Khao Pad ${Date.now()}`;
  const created = await api.post('/api/menu', { data: { name: dish, category: 'E2E', sellingPrice: 60, costPrice: 20 }, headers: auth });
  expect(created.ok(), 'create dish').toBeTruthy();
  const dishId = (await created.json()).id as string;
  try {
    const options = await api.put(`/api/menu/${dishId}/options`, {
      headers: auth,
      data: {
        groups: [
          { name: 'Size', minSelect: 1, maxSelect: 1, modifiers: [
            { name: 'Regular', priceDelta: 0, isAvailable: true },
            { name: 'Large', priceDelta: 20, isAvailable: true },
          ] },
          { name: 'Extras', minSelect: 0, maxSelect: 2, modifiers: [
            { name: 'Fried egg', priceDelta: 10, isAvailable: true },
            { name: 'Extra pork', priceDelta: 25, isAvailable: true },
            { name: 'Crispy garlic', priceDelta: 5, isAvailable: true },
          ] },
        ],
      },
    });
    expect(options.ok(), 'set options').toBeTruthy();
    // A group with min > options is refused by the server.
    const bad = await api.put(`/api/menu/${dishId}/options`, {
      headers: auth,
      data: { groups: [{ name: 'Size', minSelect: 2, maxSelect: 2, modifiers: [{ name: 'Only', priceDelta: 0, isAvailable: true }] }] },
    });
    expect(bad.status()).toBe(400);
    await page.request.post(`${baseURL}/revalidate`); // the public menu is cached

    // --- Customer picks options and writes a note --------------------------
    const username = `e2e-opt-${Date.now()}`;
    await page.goto('/register');
    await page.locator('form input').first().fill('E2E Options');
    await page.locator('input[autocomplete="username"]').fill(username);
    await page.locator('input[type="email"]').fill(`${username}@example.com`);
    await page.locator('input[type="password"]').fill('password123');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/menu');
    await page.getByRole('button', { name: `Add ${dish}` }).click();
    const dialog = page.getByRole('dialog', { name: dish });
    await expect(dialog.getByRole('radio', { name: /Regular/ })).toBeChecked(); // a required choice starts on its first option
    await dialog.getByRole('radio', { name: /Large/ }).check();
    await dialog.getByRole('checkbox', { name: /Fried egg/ }).check();
    await dialog.getByRole('checkbox', { name: /Extra pork/ }).check();
    await expect(dialog.getByRole('checkbox', { name: /Crispy garlic/ })).toBeDisabled(); // at most 2 extras
    await dialog.getByRole('checkbox', { name: /Extra pork/ }).uncheck();
    await dialog.getByLabel('Note for the kitchen').fill('No chili please');
    await dialog.getByRole('button', { name: /Add to cart · ฿90/ }).click(); // 60 + 20 + 10

    // The cart line shows the options and the note.
    const checkout = page.getByRole('link', { name: 'Checkout' });
    if (!(await checkout.isVisible())) await page.getByRole('button', { name: 'Open cart' }).click();
    await expect(page.getByText('Large · Fried egg')).toBeVisible();
    await expect(page.getByText('Note: No chili please')).toBeVisible();
    await checkout.click();
    await expect(page).toHaveURL(/\/checkout/);
    await page.getByLabel('Phone number').fill('0833333333');
    await page.getByRole('button', { name: /Place order · ฿90/ }).click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
    const orderNumber = (await page.getByRole('heading', { level: 1 }).textContent())!.replace('Order ', '').trim();
    await expect(page.getByText('Large · Fried egg')).toBeVisible();
    await expect(page.getByText('Note: No chili please')).toBeVisible();

    // --- The kitchen sees the note on the row, and the details inside ------
    const staffContext = await browser.newContext();
    const staff = await staffContext.newPage();
    await signIn(staff, STAFF.username, STAFF.password);
    await staff.goto('/admin/orders');
    const row = staff.locator('tr', { hasText: orderNumber });
    await expect(row.getByText('Note', { exact: true })).toBeVisible();
    await row.click();
    await expect(staff.getByText('Large · Fried egg')).toBeVisible();
    await expect(staff.getByText('Note: No chili please')).toBeVisible();

    // The options editor shows the dish's groups.
    await staff.goto('/admin/menu');
    await staff.getByRole('button', { name: `Options for ${dish}` }).click();
    const editor = staff.getByRole('dialog', { name: `Options for ${dish}` });
    await expect(editor.getByLabel('Group name').first()).toHaveValue('Size');
    await expect(editor.getByLabel('Group name').nth(1)).toHaveValue('Extras');
    await editor.getByRole('button', { name: 'Cancel' }).click();
    await staffContext.close();
  } finally {
    // It has an order now, so this hides it rather than deleting it.
    await api.delete(`/api/menu/${dishId}`, { headers: auth });
    await page.request.post(`${baseURL}/revalidate`);
  }
});

test('delivery to a pinned address, saved and picked again next time', async ({ page }) => {
  const username = `e2e-pin-${Date.now()}`;
  await page.goto('/register');
  await page.locator('form input').first().fill('E2E Pin');
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[type="email"]').fill(`${username}@example.com`);
  await page.locator('input[type="password"]').fill('password123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);

  // --- First order: type the address, put the pin, save it as Home ---------
  await addFirstItemAndCheckout(page);
  await page.getByRole('radio', { name: /Delivery/ }).check();
  await page.getByLabel('Phone number').fill('0844444444');
  const placeOrder = page.getByRole('button', { name: /Place order/ });
  await expect(page.getByText('Add a delivery address to place the order.')).toBeVisible();
  await page.getByLabel('Delivery address').fill('99/1 Soi Ari 4, Phaya Thai');
  await expect(page.getByText('Put the pin on the map to place the order.')).toBeVisible();
  await expect(placeOrder).toBeDisabled();

  const map = page.getByTestId('delivery-map');
  await map.click({ position: { x: 180, y: 120 } }); // tap the map: the pin goes there
  await expect(page.getByTitle('Your delivery pin. Drag it to your door.')).toBeVisible();
  await expect(page.getByText('Pin placed. Drag it if it is not on your door.')).toBeVisible();
  await expect(page.getByText('Delivery fee', { exact: true })).toBeVisible(); // priced from the pin
  await page.getByLabel('Note for the driver').fill('Blue gate');
  await expect(page.getByLabel('Save this address for next time')).toBeChecked();
  await expect(page.getByLabel('Name for this address')).toHaveValue('Home');
  await expect(placeOrder).toBeEnabled();
  await placeOrder.click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByText('99/1 Soi Ari 4, Phaya Thai · Note: Blue gate')).toBeVisible();

  // --- Second order: pick Home, everything is filled in -------------------
  await addFirstItemAndCheckout(page);
  await page.getByRole('radio', { name: /Delivery/ }).check();
  await page.getByRole('radio', { name: /Home/ }).check();
  await expect(page.getByLabel('Delivery address')).toHaveValue('99/1 Soi Ari 4, Phaya Thai');
  await expect(page.getByLabel('Note for the driver')).toHaveValue('Blue gate');
  await expect(page.getByTitle('Your delivery pin. Drag it to your door.')).toBeVisible();
  await expect(page.getByLabel('Save this address for next time')).toHaveCount(0); // already saved

  // Removing the saved address keeps what is filled in for this order.
  await page.getByRole('button', { name: 'Remove Home' }).click();
  await expect(page.getByRole('radio', { name: /Home/ })).toHaveCount(0);
  await expect(page.getByLabel('Delivery address')).toHaveValue('99/1 Soi Ari 4, Phaya Thai');
  await page.getByLabel('Phone number').fill('0844444444');
  await page.getByRole('button', { name: /Place order/ }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByText('99/1 Soi Ari 4, Phaya Thai · Note: Blue gate')).toBeVisible();
});

test('staff switch to busy and paused; customers see it and cannot order while paused', async ({ page, browser }) => {
  const username = `e2e-busy-${Date.now()}`;
  await page.goto('/register');
  await page.locator('form input').first().fill('E2E Busy');
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[type="email"]').fill(`${username}@example.com`);
  await page.locator('input[type="password"]').fill('password123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await signIn(staff, STAFF.username, STAFF.password);
  await staff.goto('/admin/orders');
  const modes = staff.getByRole('group', { name: 'Online ordering' });

  // Busy: customers are told it takes longer, and still order.
  await modes.getByRole('button', { name: 'Busy' }).click();
  await expect(modes.getByRole('button', { name: 'Busy' })).toHaveAttribute('aria-pressed', 'true');
  await expect(staff.getByLabel('Extra minutes while busy')).toHaveValue('15');
  // A full page load each time: the open status is cached in the page for a minute.
  await page.goto('/menu');
  await addFirstItemAndCheckout(page);
  await expect(page.getByText('Orders take about 15 minutes longer than usual.')).toBeVisible();
  await page.getByLabel('Phone number').fill('0822222222');
  await page.getByRole('button', { name: /Place order/ }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  const orderNumber = (await page.getByRole('heading', { level: 1 }).textContent())!.replace('Order ', '').trim();

  // The accept dialog starts at the usual 15 minutes plus the busy 15.
  await staff.reload();
  const row = staff.locator('tr', { hasText: orderNumber });
  await row.getByRole('button', { name: 'Accept' }).click();
  await expect(staff.getByRole('button', { name: 'Accept · ready in 30 min' })).toBeVisible();
  await staff.getByRole('button', { name: 'Back' }).click();

  // Paused: the menu says so, checkout cannot place an order.
  await modes.getByRole('button', { name: 'Paused' }).click();
  await expect(modes.getByRole('button', { name: 'Paused' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/menu');
  await expect(page.getByText('Online ordering is paused.')).toBeVisible();
  await addFirstItemAndCheckout(page);
  await expect(page.getByText('Online ordering is paused.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ordering is paused right now' })).toBeDisabled();

  // Back to normal: the notice disappears and ordering works again.
  await modes.getByRole('button', { name: 'Normal' }).click();
  await expect(modes.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/menu');
  await expect(page.getByRole('button', { name: 'Add' }).first()).toBeVisible();
  await expect(page.getByText('Online ordering is paused.')).toHaveCount(0);
  await expect(page.getByText(/We're busy right now/)).toHaveCount(0);
  await addFirstItemAndCheckout(page);
  await expect(page.getByRole('button', { name: /Place order/ })).toBeVisible();
  await staffContext.close();
});
