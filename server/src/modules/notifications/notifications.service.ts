// Sends alerts by LINE and email (Step 3g) and keeps their settings.
// Never throws from notify(): a failed message is logged and shown on the
// settings page, the app carries on.
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { audit } from '../../utils/auditLog';
import { businessDate, zonedParts } from '../../utils/businessTime';
import { formatPoNumber } from '../purchasing/purchasing.rules';
import { getRestaurantProfile } from '../settings/settings.service';
import { pushLine } from './line';
import {
  applyPatch, channelProblem, emailReceivers, noticeEvent, noticeMessage, parseNotificationSettings,
  type Notice, type NotificationPatch, type NotificationSettings,
} from './notifications.rules';
import { sendMail } from './smtp';

const KEY = 'NOTIFICATIONS';
const DIGEST_KEY = 'NOTIFY_DELIVERIES_DAY';
const DIGEST_HOUR = 8; // deliveries due today: one message after 08:00 (Bangkok)
const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

type Channel = 'line' | 'email';
export interface ChannelStatus { at: string; ok: boolean; error?: string }
const status: Record<Channel, ChannelStatus | null> = { line: null, email: null };

let cache: NotificationSettings | null = null;

export async function getNotificationSettings(): Promise<NotificationSettings> {
  if (!cache) {
    const row = await prisma.setting.findUnique({ where: { key: KEY } });
    cache = parseNotificationSettings(row?.value);
  }
  return cache;
}

export async function setNotificationSettings(patch: NotificationPatch, actorId: string): Promise<NotificationSettings> {
  const next = applyPatch(await getNotificationSettings(), patch);
  const value = JSON.stringify(next);
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  cache = next;
  // Which parts changed, never the secrets themselves.
  const changed = [
    ...Object.keys(patch).filter((k) => !['line', 'email', 'events'].includes(k)),
    ...Object.keys(patch.events ?? {}).map((k) => `events.${k}`),
    ...Object.keys(patch.line ?? {}).map((k) => `line.${k}`),
    ...Object.keys(patch.email ?? {}).map((k) => `email.${k}`),
  ];
  await audit({ actorId, action: 'UPDATE', entityType: 'SETTING', entityId: KEY, metadata: { changed } });
  return next;
}

export const channelStatus = () => ({ ...status });

async function send(channel: Channel, s: NotificationSettings, msg: { subject: string; text: string }) {
  if (channel === 'line') {
    await pushLine(s.line.token, s.line.to, msg.text);
  } else {
    const e = s.email;
    await sendMail({ host: e.host, port: e.port, user: e.user, pass: e.pass, from: e.from }, { to: emailReceivers(e.to), subject: msg.subject, text: msg.text });
  }
}

async function sendAndRecord(channel: Channel, s: NotificationSettings, msg: { subject: string; text: string }) {
  try {
    await send(channel, s, msg);
    status[channel] = { at: new Date().toISOString(), ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    status[channel] = { at: new Date().toISOString(), ok: false, error };
    throw err;
  }
}

/** Sends each notice on every switched-on channel whose alert is switched on. */
export async function notify(notices: Notice[]): Promise<void> {
  try {
    const s = await getNotificationSettings();
    const channels = (['line', 'email'] as const).filter((c) => s[c].enabled && !channelProblem(s, c));
    if (!channels.length) return;
    const restaurant = (await getRestaurantProfile()).name;
    for (const n of notices) {
      const event = noticeEvent(n);
      if (event && !s.events[event]) continue;
      const msg = noticeMessage(n, s.language, restaurant);
      for (const c of channels) {
        await sendAndRecord(c, s, msg).catch((err) => console.error(`[notify] ${c} failed:`, err instanceof Error ? err.message : err));
      }
    }
  } catch (err) {
    console.error('[notify] Could not send notifications:', err instanceof Error ? err.message : err);
  }
}

/** Owner: "Send test" — sends now and says what went wrong. */
export async function sendTest(channel: Channel): Promise<ChannelStatus> {
  const s = await getNotificationSettings();
  const problem = channelProblem(s, channel);
  if (problem) throw httpError(400, problem);
  const restaurant = (await getRestaurantProfile()).name;
  try {
    await sendAndRecord(channel, s, noticeMessage({ kind: 'test' }, s.language, restaurant));
  } catch (err) {
    throw httpError(502, err instanceof Error ? err.message : String(err));
  }
  return status[channel]!;
}

/**
 * Once a day after 08:00: the deliveries due today (and late ones), or null
 * when it is not time yet, it was done today, or nothing is due.
 */
export async function checkDeliveriesDue(now = new Date()): Promise<Notice | null> {
  const tz = env.businessTimeZone;
  if (zonedParts(now, tz).hour < DIGEST_HOUR) return null;
  const today = businessDate(now, tz);
  const last = await prisma.setting.findUnique({ where: { key: DIGEST_KEY } });
  if (last?.value === today) return null;
  await prisma.setting.upsert({ where: { key: DIGEST_KEY }, update: { value: today }, create: { key: DIGEST_KEY, value: today } });
  const due = await prisma.purchaseOrder.findMany({
    where: { status: { in: ['SENT', 'PARTLY_RECEIVED'] }, expectedDate: { lte: today } },
    select: { number: true, expectedDate: true, supplier: { select: { name: true } } },
    orderBy: { expectedDate: 'asc' },
  });
  if (!due.length) return null;
  return { kind: 'deliveries', due: due.map((o) => ({ label: formatPoNumber(o.number), supplier: o.supplier.name, late: (o.expectedDate ?? today) < today })) };
}
