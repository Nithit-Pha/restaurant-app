import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

// The owner deletes a deactivated staff account from Settings. A never-used
// account is removed; one that signed in keeps its history as "Deleted user".
const ADMIN = { username: process.env.E2E_ADMIN_USERNAME || 'superadmin', password: process.env.E2E_ADMIN_PASSWORD || 'superadmin123' };
const API = process.env.E2E_API_URL || 'http://localhost:3001';
const RUN = Date.now();
const UNUSED = { name: `E2E Unused ${RUN}`, username: `e2e-unused-${RUN}`, password: 'e2e-password-1' };
const USED = { name: `E2E Used ${RUN}`, username: `e2e-used-${RUN}`, password: 'e2e-password-2' };

let api: APIRequestContext;
let auth: Record<string, string> = {};
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  api = await request.newContext({ baseURL: API });
  const login = await api.post('/api/auth/login', { data: ADMIN });
  expect(login.ok(), 'admin login').toBeTruthy();
  auth = { authorization: `Bearer ${(await login.json()).accessToken}` };
  for (const s of [UNUSED, USED]) {
    const res = await api.post('/api/admin/staff', { data: { ...s, role: 'STAFF' }, headers: auth });
    expect(res.ok(), `create ${s.username}`).toBeTruthy();
    ids[s.username] = (await res.json()).id;
  }
  // USED signs in once, so it has history (a LOGIN entry in the audit log).
  expect((await api.post('/api/auth/login', { data: USED })).ok(), 'staff login').toBeTruthy();
  for (const id of Object.values(ids)) {
    await api.patch(`/api/admin/staff/${id}/active`, { data: { isActive: false }, headers: auth });
  }
});

test.afterAll(async () => {
  // If the test stopped early, delete what is left (already-deleted ones answer 404).
  for (const id of Object.values(ids)) await api.delete(`/api/admin/staff/${id}`, { headers: auth });
  await api.dispose();
});

async function deleteInSettings(page: Page, who: { name: string; username: string }) {
  await page.getByRole('button', { name: `Delete the account of ${who.name}` }).click();
  const dialog = page.getByRole('dialog', { name: `Delete ${who.name}?` });
  const confirm = dialog.getByRole('button', { name: 'Delete', exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(`Type the username ${who.username} to confirm`).fill('wrong-name');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(`Type the username ${who.username} to confirm`).fill(who.username);
  await confirm.click();
  await expect(page.getByText(`${who.name} was deleted`)).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(who.name) })).toHaveCount(0);
}

test('owner deletes deactivated staff accounts; they can never sign in again', async ({ page }) => {
  await page.goto('/en/login');
  await page.locator('input[autocomplete="username"]').fill(ADMIN.username);
  await page.locator('input[autocomplete="current-password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/(en|th)$/);
  await page.goto('/en/admin/settings#staff');
  await expect(page.getByRole('row', { name: new RegExp(UNUSED.name) })).toBeVisible();

  // Active accounts have no Delete button (deactivate first).
  await expect(page.getByRole('button', { name: `Delete the account of ${ADMIN.username}` })).toHaveCount(0);

  await deleteInSettings(page, UNUSED);
  await deleteInSettings(page, USED);

  // Never used: gone. Used: kept as "Deleted user" without personal data.
  const audit = await (await api.get('/api/admin/audit-log?entityType=USER&limit=20', { headers: auth })).json();
  const entries: { action: string; entityId: string; metadata: { mode?: string } }[] = audit.items ?? audit.logs ?? audit;
  const modeOf = (id: string) => entries.find((e) => e.action === 'DELETE' && e.entityId === id)?.metadata.mode;
  expect(modeOf(ids[UNUSED.username])).toBe('REMOVED');
  expect(modeOf(ids[USED.username])).toBe('ANONYMIZED');

  // Neither can sign in, and a second delete finds nothing.
  for (const s of [UNUSED, USED]) {
    expect((await api.post('/api/auth/login', { data: s })).status()).toBe(401);
    expect((await api.delete(`/api/admin/staff/${ids[s.username]}`, { headers: auth })).status()).toBe(404);
  }
});
