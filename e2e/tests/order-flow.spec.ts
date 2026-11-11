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
  await row.getByRole('button', { name: 'Picked up' }).click();
  await expect(row.getByText('Completed')).toBeVisible();
  await expect(row.getByRole('button', { name: /Accept|Mark ready|Picked up/ })).toHaveCount(0);

  // Cash collected at the counter.
  await expect(row.getByText('Cash · Unpaid')).toBeVisible();
  await row.getByRole('button', { name: 'Mark paid' }).click();
  await staff.getByRole('button', { name: 'Cash received' }).click();
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
