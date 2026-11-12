import { beforeEach, describe, expect, it, vi } from 'vitest';

const { settings, orders, pushLine, sendMail } = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  orders: [] as { number: number; expectedDate: string; supplier: { name: string } }[],
  pushLine: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock('../../config/db', () => ({
  prisma: {
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) => (settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null),
      upsert: async ({ where, create }: { where: { key: string }; create: { value: string } }) => { settings.set(where.key, create.value); },
    },
    purchaseOrder: { findMany: async () => orders },
  },
}));
vi.mock('../../utils/auditLog', () => ({ audit: vi.fn() }));
vi.mock('../settings/settings.service', () => ({ getRestaurantProfile: async () => ({ name: 'Baan' }) }));
vi.mock('./line', () => ({ pushLine }));
vi.mock('./smtp', () => ({ sendMail }));

import { checkDeliveriesDue, notify, sendTest, setNotificationSettings, channelStatus } from './notifications.service';

const at = (iso: string) => new Date(`${iso}+07:00`);
const DRAFT = { kind: 'draft' as const, label: 'PO-0012', supplier: 'Market', lines: 2, urgent: false, added: false };

beforeEach(async () => {
  pushLine.mockReset();
  sendMail.mockReset();
  orders.length = 0;
  settings.delete('NOTIFY_DELIVERIES_DAY');
  // Back to defaults (everything off), through the service so its cache follows.
  await setNotificationSettings({ events: { urgentStock: true, newDrafts: true, deliveriesDue: true }, line: { enabled: false, token: '', to: '' }, email: { enabled: false, host: '', user: '', pass: '', from: '', to: '' } }, 'owner');
});

describe('notify', () => {
  it('sends nothing while LINE and email are off (the default)', async () => {
    await notify([DRAFT]);
    expect(pushLine).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends on switched-on channels only, and only alerts that are on', async () => {
    await setNotificationSettings({ line: { enabled: true, token: 'tok', to: 'U1' }, language: 'en', events: { newDrafts: false } }, 'owner');
    await notify([DRAFT, { kind: 'urgent', items: [{ name: 'Rice', quantity: '2', unit: 'kg' }] }]);
    expect(pushLine).toHaveBeenCalledTimes(1);
    expect(pushLine).toHaveBeenCalledWith('tok', 'U1', '[Baan] Urgent: stock is very low\n• Rice: 2 kg left');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('a failing channel does not stop the other, and is shown as failed', async () => {
    await setNotificationSettings({
      line: { enabled: true, token: 'tok', to: 'U1' },
      email: { enabled: true, host: 'smtp.gmail.com', port: 465, user: 'u', pass: 'p', from: 'a@b.c', to: 'x@y.z, z@y.x' },
    }, 'owner');
    pushLine.mockRejectedValue(new Error('LINE refused the message: 401'));
    await expect(notify([DRAFT])).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.gmail.com', port: 465 }), expect.objectContaining({ to: ['x@y.z', 'z@y.x'] }));
    expect(channelStatus()).toMatchObject({ line: { ok: false, error: 'LINE refused the message: 401' }, email: { ok: true } });
  });

  it('"Send test" says what is missing or what went wrong', async () => {
    await expect(sendTest('line')).rejects.toMatchObject({ statusCode: 400 });
    await setNotificationSettings({ line: { token: 'tok', to: 'U1' } }, 'owner'); // works even while switched off
    pushLine.mockRejectedValueOnce(new Error('LINE refused the message: 400 The request body has 1 error(s)'));
    await expect(sendTest('line')).rejects.toMatchObject({ statusCode: 502, message: expect.stringMatching(/400/) });
    await expect(sendTest('line')).resolves.toMatchObject({ ok: true });
  });
});

describe('deliveries due today', () => {
  it('once a day after 08:00, only when something is due', async () => {
    orders.push({ number: 5, expectedDate: '2026-11-11', supplier: { name: 'Farm' } }, { number: 6, expectedDate: '2026-11-12', supplier: { name: 'Market' } });
    expect(await checkDeliveriesDue(at('2026-11-12T07:30'))).toBeNull(); // too early
    expect(await checkDeliveriesDue(at('2026-11-12T08:05'))).toEqual({
      kind: 'deliveries', due: [{ label: 'PO-0005', supplier: 'Farm', late: true }, { label: 'PO-0006', supplier: 'Market', late: false }],
    });
    expect(await checkDeliveriesDue(at('2026-11-12T08:10'))).toBeNull(); // already done today
    orders.length = 0;
    expect(await checkDeliveriesDue(at('2026-11-13T09:00'))).toBeNull(); // nothing due
  });
});
