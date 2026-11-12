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

// Step 2b: a recipe set in the menu screen; accepting an order takes the
// ingredients out of stock, cancelling it puts them back.
test.describe('recipes and orders', () => {
  const EGG = `E2E Egg ${Date.now()}`;
  const DISH = `E2E Omelette ${Date.now()}`;
  const CATEGORY = `e2e-stock-${Date.now()}`;
  const WEB = process.env.E2E_BASE_URL || 'http://localhost:5173';
  let eggId = '';
  let dishId = '';
  let hoursWereEnforced = true;

  const stockOf = async () => {
    const list = await (await api.get('/api/stock/ingredients?all=true', { headers: auth })).json();
    return Number(list.find((i: { id: string }) => i.id === eggId).quantity);
  };

  test.beforeAll(async () => {
    const settings = await (await api.get('/api/settings', { headers: auth })).json();
    hoursWereEnforced = settings.ORDERING_HOURS_ENFORCED !== 0;
    await api.put('/api/settings/ordering', { data: { hoursEnforced: false }, headers: auth });
    await api.put('/api/settings/busy', { data: { mode: 'NORMAL' }, headers: auth });
    const egg = await api.post('/api/stock/ingredients', { data: { name: EGG, unit: 'pcs', reorderLevel: 0, openingStock: 10 }, headers: auth });
    expect(egg.ok(), 'create ingredient').toBeTruthy();
    eggId = (await egg.json()).id;
    const dish = await api.post('/api/menu', { data: { name: DISH, category: CATEGORY, sellingPrice: 60 }, headers: auth });
    expect(dish.ok(), 'create menu item').toBeTruthy();
    dishId = (await dish.json()).id;
  });

  test.afterAll(async () => {
    await api.put('/api/settings/ordering', { data: { hoursEnforced: hoursWereEnforced }, headers: auth });
    if (dishId) await api.delete(`/api/menu/${dishId}`, { headers: auth }); // hidden, since it has orders
    if (eggId) await api.patch(`/api/stock/ingredients/${eggId}`, { data: { isActive: false }, headers: auth });
    await api.post(`${WEB}/revalidate`).catch(() => undefined); // the website's hook, not the API
  });

  test('accepting takes the recipe out of stock, cancelling puts it back', async ({ page }) => {
    // --- Owner sets the recipe: 2 eggs per omelette ------------------------
    await page.goto('/en/login');
    await page.locator('input[autocomplete="username"]').fill(ADMIN.username);
    await page.locator('input[autocomplete="current-password"]').fill(ADMIN.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/(en|th)$/);
    await page.goto('/en/admin/menu');
    await page.getByLabel('Search dishes').fill(DISH);
    await page.getByRole('button', { name: `Recipe for ${DISH}` }).click();
    const dialog = page.getByRole('dialog', { name: `Recipe: ${DISH}` });
    await expect(dialog.getByText('No recipe yet')).toBeVisible();
    await dialog.getByRole('button', { name: 'Add ingredient' }).click();
    await dialog.getByLabel('Ingredient 1', { exact: true }).selectOption({ label: EGG });
    await dialog.getByLabel('Amount 1', { exact: true }).fill('2');
    await dialog.getByRole('button', { name: 'Save recipe' }).click();
    await expect(dialog).toBeHidden();
    const recipe = await (await api.get(`/api/stock/recipes/${dishId}`, { headers: auth })).json();
    expect(recipe.map((r: { ingredientId: string; amount: string }) => [r.ingredientId, Number(r.amount)])).toEqual([[eggId, 2]]);

    // --- Order 3 omelettes: nothing happens until staff accept -------------
    const placed = await api.post('/api/orders', {
      headers: auth,
      data: { items: [{ menuItemId: dishId, quantity: 3 }], type: 'PICKUP', customerPhone: '0811111111' },
    });
    expect(placed.ok(), `place order: ${await placed.text()}`).toBeTruthy();
    const order = await placed.json();
    expect(await stockOf()).toBe(10);

    const accept = await api.patch(`/api/orders/${order.id}/status`, { headers: auth, data: { status: 'PREPARING', prepMinutes: 10 } });
    expect(accept.ok(), 'accept').toBeTruthy();
    expect(await stockOf()).toBe(4); // 10 - 3 × 2

    const cancel = await api.patch(`/api/orders/${order.id}/status`, { headers: auth, data: { status: 'CANCELLED', cancelReason: 'SOLD_OUT' } });
    expect(cancel.ok(), 'cancel').toBeTruthy();
    expect(await stockOf()).toBe(10);

    const moves = await (await api.get(`/api/stock/movements?ingredientId=${eggId}`, { headers: auth })).json();
    expect(moves.slice(0, 2).map((m: { type: string; change: string }) => `${m.type} ${Number(m.change)}`)).toEqual(['SALE_RETURN 6', 'SALE -6']);
  });

  // Step 2c: less than one portion left -> sold out everywhere; low stock is counted.
  test('a dish is sold out when an ingredient runs short, and back after stock in', async ({ page }) => {
    const menuItem = async () => (await (await api.get(`/api/menu?category=${CATEGORY}`)).json())
      .find((m: { id: string }) => m.id === dishId);

    // 10 eggs, 2 per omelette: throw 9 away -> 1 left, low at 2.
    await api.patch(`/api/stock/ingredients/${eggId}`, { data: { reorderLevel: 2 }, headers: auth });
    const waste = await api.post(`/api/stock/ingredients/${eggId}/waste`, { data: { amount: 9, reason: 'E2E dropped' }, headers: auth });
    expect(waste.ok(), 'waste').toBeTruthy();
    expect((await menuItem()).soldOut).toBe(true);

    // Ordering it is refused, by the quote and by checkout.
    const order = { items: [{ menuItemId: dishId, quantity: 1 }], type: 'PICKUP' };
    const quote = await api.post('/api/orders/quote', { headers: auth, data: order });
    expect(quote.status()).toBe(409);
    expect((await quote.json()).message).toContain('sold out');
    const placed = await api.post('/api/orders', { headers: auth, data: { ...order, customerPhone: '0811111111' } });
    expect(placed.status()).toBe(409);

    // The public menu page (cached) shows it as sold out right away.
    await page.goto(`/en/menu?category=${CATEGORY}`);
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: DISH }) });
    await expect(card.getByText('Sold out')).toBeVisible();
    await expect(card.getByRole('button', { name: `Add ${DISH}` })).toHaveCount(0);

    // Staff see the low-stock counter next to "Stock" and the badge on the menu screen.
    await page.goto('/en/login');
    await page.locator('input[autocomplete="username"]').fill(ADMIN.username);
    await page.locator('input[autocomplete="current-password"]').fill(ADMIN.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/(en|th)$/);
    const stockLink = page.getByRole('link', { name: /Stock/ }).first();
    await expect(stockLink).toContainText(/\d+\s*low on stock/);
    await page.goto('/en/admin/menu');
    await page.getByLabel('Search dishes').fill(DISH);
    await expect(page.getByRole('row', { name: new RegExp(DISH) }).getByText('Sold out')).toBeVisible();

    // Stock in -> available again, on the menu page too.
    const stockIn = await api.post(`/api/stock/ingredients/${eggId}/in`, { data: { amount: 5 }, headers: auth });
    expect(stockIn.ok(), 'stock in').toBeTruthy();
    expect((await menuItem()).soldOut).toBe(false);
    await expect.poll(async () => {
      await page.goto(`/en/menu?category=${CATEGORY}`);
      return page.getByRole('button', { name: `Add ${DISH}` }).count();
    }, { timeout: 15_000 }).toBe(1);
  });
});
