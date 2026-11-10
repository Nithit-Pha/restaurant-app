import { test, expect, request, type APIRequestContext, type Page } from '@playwright/test';

// Seeded accounts (server/prisma/seed.ts). Override in CI with env vars.
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL || 'superadmin@restaurant.com', password: process.env.E2E_ADMIN_PASSWORD || 'superadmin123' };
const STAFF = { email: process.env.E2E_STAFF_EMAIL || 'staff@restaurant.com', password: process.env.E2E_STAFF_PASSWORD || 'staff123' };
const API = process.env.E2E_API_URL || 'http://localhost:3001';

let api: APIRequestContext;
let adminToken = '';
let hoursWereEnforced = true;

// The test must work at any time of day, so switch off the opening-hours
// rule for the run and restore it afterwards.
test.beforeAll(async () => {
  api = await request.newContext({ baseURL: API });
  const login = await api.post('/api/auth/login', { data: ADMIN });
  expect(login.ok(), 'admin login').toBeTruthy();
  adminToken = (await login.json()).accessToken;
  const settings = await (await api.get('/api/settings', { headers: { authorization: `Bearer ${adminToken}` } })).json();
  hoursWereEnforced = settings.ORDERING_HOURS_ENFORCED !== 0;
  await api.put('/api/settings/ordering', { data: { hoursEnforced: false }, headers: { authorization: `Bearer ${adminToken}` } });
});

test.afterAll(async () => {
  await api.put('/api/settings/ordering', { data: { hoursEnforced: hoursWereEnforced }, headers: { authorization: `Bearer ${adminToken}` } });
  await api.dispose();
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
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
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.locator('form input').first().fill('E2E Customer');
  await page.locator('input[type="email"]').fill(email);
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
  await signIn(staff, STAFF.email, STAFF.password);
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
  await staffContext.close();

  // --- Customer sees the final status -------------------------------------
  await page.reload();
  await expect(page.getByText('Completed').first()).toBeVisible();
});

test('customer can cancel while the order is still waiting; staff see why', async ({ page, browser }) => {
  const email = `e2e-cancel-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.locator('form input').first().fill('E2E Canceller');
  await page.locator('input[type="email"]').fill(email);
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
  await signIn(staff, STAFF.email, STAFF.password);
  await staff.goto('/admin/orders');
  const row = staff.locator('tr', { hasText: orderNumber });
  await expect(row.getByText('Cancelled')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await staffContext.close();
});
