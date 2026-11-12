import { expect, test } from '@playwright/test';

test('legacy menu links open in English and the language switch preserves the filter', async ({ page }) => {
  await page.goto('/menu?category=example');
  await expect(page).toHaveURL(/\/en\/menu\?category=example$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.getByRole('button', { name: 'ภาษาไทย' }).click();
  await expect(page).toHaveURL(/\/th\/menu\?category=example$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.getByRole('button', { name: 'ภาษาไทย' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'เมนู', exact: true }).first()).toHaveAttribute('href', '/th/menu');
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', /\/en\/menu\?category=example$/);

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/menu\?category=example$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the account language is restored on the next sign-in', async ({ page, browser }) => {
  const username = `e2e-locale-${Date.now()}`;
  const password = 'password123';
  await page.goto('/en/register');
  await page.locator('input[autocomplete="name"]').fill('Locale Test');
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="email"]').fill(`${username}@example.com`);
  await page.locator('input[autocomplete="new-password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/en$/);

  const saved = page.waitForResponse((response) =>
    response.url().endsWith('/api/auth/me/locale') && response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'ภาษาไทย' }).click();
  expect((await saved).status()).toBe(204);
  await expect(page).toHaveURL(/\/th$/);

  const newSession = await browser.newPage();
  try {
    await newSession.goto('/en/login');
    await newSession.locator('input[autocomplete="username"]').fill(username);
    await newSession.locator('input[autocomplete="current-password"]').fill(password);
    await newSession.locator('button[type="submit"]').click();
    await expect(newSession).toHaveURL(/\/th$/);
    await expect(newSession.locator('html')).toHaveAttribute('lang', 'th');
  } finally {
    await newSession.close();
  }
});

test('switching languages keeps the cart and shows the Thai dish name when available', async ({ page, request }) => {
  const login = await request.post('/api/auth/login', {
    data: {
      username: process.env.E2E_ADMIN_USERNAME || 'superadmin',
      password: process.env.E2E_ADMIN_PASSWORD || 'superadmin123',
    },
  });
  expect(login.ok(), 'sign in to create a test menu item').toBeTruthy();
  const headers = { authorization: `Bearer ${(await login.json()).accessToken}` };
  const category = `e2e-locale-${Date.now()}`;
  const name = 'Fried rice';
  const nameTh = 'ข้าวผัด';
  const description = 'Fried rice with egg and vegetables';
  const created = await request.post('/api/menu', {
    headers,
    data: { name, nameTh, description, category, sellingPrice: 89 },
  });
  expect(created.ok(), 'create bilingual menu item').toBeTruthy();
  const { id } = await created.json();

  try {
    await page.goto(`/en/menu?category=${category}`);
    await page.getByRole('button', { name: `Add ${name}` }).click();
    const englishCart = page.getByRole('dialog', { name: 'Your cart' });
    await expect(englishCart.getByText(name, { exact: true })).toBeVisible();
    await englishCart.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'ภาษาไทย' }).click();
    await expect(page).toHaveURL(`/th/menu?category=${category}`);
    const dish = page.getByRole('article').filter({ has: page.getByRole('heading', { name: nameTh }) });
    await expect(dish.getByText(description)).toBeVisible();

    await page.getByRole('button', { name: 'เปิดตะกร้า' }).click();
    await expect(page.getByRole('dialog', { name: 'ตะกร้าของคุณ' }).getByText(nameTh, { exact: true })).toBeVisible();
  } finally {
    await request.delete(`/api/menu/${id}`, { headers });
    await request.post('/revalidate');
  }
});

test('switching language with unsaved changes asks first', async ({ page }) => {
  // The language is part of the URL, so switching rebuilds the page and drops typed input.
  await page.goto('/en/login');
  await page.locator('input[autocomplete="username"]').fill(process.env.E2E_ADMIN_USERNAME || 'superadmin');
  await page.locator('input[autocomplete="current-password"]').fill(process.env.E2E_ADMIN_PASSWORD || 'superadmin123');
  await page.locator('button[type="submit"]').click();
  // Sign-in opens the account's saved language; it is put back at the end.
  await expect(page).toHaveURL(/\/(en|th)$/);
  const accountLocale = new URL(page.url()).pathname.slice(1);

  await page.goto('/en/admin/settings');
  const tax = page.locator('#tax-rate');
  await expect(tax).not.toHaveValue('');
  const original = await tax.inputValue();
  const changed = original === '42' ? '43' : '42';
  await tax.fill(changed); // never saved

  // Cancel keeps the page and the typed value.
  await page.getByRole('button', { name: 'ภาษาไทย' }).click();
  const ask = page.getByRole('dialog', { name: 'Switch language?' });
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toBeHidden();
  await expect(page).toHaveURL(/\/en\/admin\/settings$/);
  await expect(tax).toHaveValue(changed);

  // Confirming switches and drops the unsaved value.
  await page.getByRole('button', { name: 'ภาษาไทย' }).click();
  await ask.getByRole('button', { name: 'Switch and discard' }).click();
  await expect(page).toHaveURL(/\/th\/admin\/settings$/);
  await expect(page.locator('#tax-rate')).toHaveValue(original);

  // Nothing unsaved: switches straight away.
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/admin\/settings$/);

  if (accountLocale === 'th') {
    await page.getByRole('button', { name: 'ภาษาไทย' }).click();
    await expect(page).toHaveURL(/\/th\/admin\/settings$/);
  }
});

test('a category filter is kept as text in the menu structured data', async ({ page }) => {
  const category = '</script><span data-injected>test</span>';
  const response = await page.goto(`/th/menu?category=${encodeURIComponent(category)}`);
  expect(await response?.text()).not.toContain('</script><span data-injected>');
  await expect(page.locator('[data-injected]')).toHaveCount(0);
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const menu = scripts.map((body) => JSON.parse(body)).find((entry) => entry['@type'] === 'Menu');
  expect(menu?.name).toContain(category);
});
