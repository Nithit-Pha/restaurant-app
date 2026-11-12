import { expect, request, test, type APIRequestContext } from '@playwright/test';

// Step 2a: the owner adds an ingredient; stock in (with a price), count and
// waste change the quantity, the low-stock flag and the history.
const ADMIN = { username: process.env.E2E_ADMIN_USERNAME || 'superadmin', password: process.env.E2E_ADMIN_PASSWORD || 'superadmin123' };
const API = process.env.E2E_API_URL || 'http://localhost:3001';
const NAME = `E2E Pork ${Date.now()}`;

let api: APIRequestContext;
let auth: Record<string, string> = {};

test.beforeAll(async () => {
  api = await request.newContext({ baseURL: API });
  const login = await api.post('/api/auth/login', { data: ADMIN });
  expect(login.ok(), 'admin login').toBeTruthy();
  auth = { authorization: `Bearer ${(await login.json()).accessToken}` };
});

// Ingredients are never deleted: switch the test one off, and remove the test expense from Finance.
test.afterAll(async () => {
  const ingredients = await (await api.get('/api/stock/ingredients', { headers: auth })).json();
  const ing = ingredients.find((i: { name: string }) => i.name === NAME);
  if (ing) await api.patch(`/api/stock/ingredients/${ing.id}`, { data: { isActive: false }, headers: auth });
  const list = await (await api.get('/api/finance/expenses', { headers: auth })).json();
  const expenses: { id: string; description?: string }[] = Array.isArray(list) ? list : list.items ?? list.expenses ?? [];
  for (const e of expenses.filter((x) => x.description?.includes(NAME))) {
    await api.delete(`/api/finance/expenses/${e.id}`, { headers: auth });
  }
  await api.dispose();
});

test('owner adds an ingredient; stock in, count and waste update stock and history', async ({ page }) => {
  await page.goto('/en/login');
  await page.locator('input[autocomplete="username"]').fill(ADMIN.username);
  await page.locator('input[autocomplete="current-password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/(en|th)$/);
  await page.goto('/en/admin/stock');

  // --- Add: 3 kg now, low at 2 kg ----------------------------------------
  await page.getByRole('button', { name: 'Add ingredient' }).first().click();
  const add = page.getByRole('dialog', { name: 'Add ingredient' });
  await add.getByLabel('Name').fill(NAME);
  await add.getByLabel('Low at').fill('2');
  await add.getByLabel('Kept in').fill('Fridge 1');
  await add.getByLabel('Stock now').fill('3');
  await add.getByRole('button', { name: 'Add ingredient' }).click();
  await expect(add).toBeHidden();

  await page.getByLabel('Search ingredients').fill(NAME);
  // The ingredient row starts with the name (history rows start with the time).
  const row = page.getByRole('row', { name: new RegExp(`^${NAME}`) });
  await expect(row).toContainText('3 kg');
  await expect(row.getByText('Low', { exact: true })).toHaveCount(0);

  // --- Stock in 2.5 kg for 450 THB -> 5.5 kg -----------------------------
  await row.getByRole('button', { name: `Stock in: ${NAME}` }).click();
  const stockIn = page.getByRole('dialog', { name: `Stock in: ${NAME}` });
  await stockIn.getByLabel(/Amount received/).fill('2.5');
  await stockIn.getByLabel(/Price paid/).fill('450');
  await stockIn.getByRole('button', { name: 'Add to stock' }).click();
  await expect(stockIn).toBeHidden();
  await expect(row).toContainText('5.5 kg');

  // --- Count 5.2 kg -> difference -0.3 -----------------------------------
  await row.getByRole('button', { name: `Count ${NAME}` }).click();
  const count = page.getByRole('dialog', { name: `Count ${NAME}` });
  await count.getByLabel(/Counted amount/).fill('5.2');
  await count.getByRole('button', { name: 'Save count' }).click();
  await expect(count).toBeHidden();
  await expect(page.getByText('Difference: -0.3 kg')).toBeVisible();
  await expect(row).toContainText('5.2 kg');

  // --- Waste needs a reason; 4 kg out -> 1.2 kg, low ---------------------
  await row.getByRole('button', { name: `Waste: ${NAME}` }).click();
  const waste = page.getByRole('dialog', { name: `Waste: ${NAME}` });
  await waste.getByLabel(/Amount thrown away/).fill('4');
  await waste.getByRole('button', { name: 'Take out of stock' }).click();
  await expect(waste.getByText('Say why it was thrown away.')).toBeVisible();
  await waste.getByLabel('Reason').fill('Spoiled');
  await waste.getByRole('button', { name: 'Take out of stock' }).click();
  await expect(waste).toBeHidden();
  await expect(row).toContainText('1.2 kg');
  await expect(row.getByText('Low', { exact: true })).toBeVisible();

  // --- History of this ingredient, newest first --------------------------
  await row.getByRole('button', { name: `History of ${NAME}` }).click();
  const history = page.locator('#stock-history');
  await expect(history.getByRole('heading', { name: `History of ${NAME}` })).toBeVisible();
  const rows = history.locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('Waste');
  await expect(rows.nth(0)).toContainText('Spoiled');
  await expect(rows.nth(1)).toContainText('-0.3 kg');
  await expect(rows.nth(2)).toContainText('+2.5 kg');
  await expect(rows.nth(3)).toContainText('Opening stock');

  // --- The priced stock in is a Finance expense --------------------------
  const list = await (await page.request.get(`${API}/api/finance/expenses`, { headers: auth })).json();
  const expenses: { description?: string; category: string; amount: string | number }[] = Array.isArray(list) ? list : list.items ?? list.expenses ?? [];
  const expense = expenses.find((e) => e.description === `Stock in: 2.5 kg ${NAME}`);
  expect(expense?.category).toBe('FOOD_SUPPLY');
  expect(Number(expense?.amount)).toBe(450);
});
