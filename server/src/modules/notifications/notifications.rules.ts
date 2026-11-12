// Settings → Notifications (Step 3g). Web alerts (the bell) are on by default;
// LINE and email are off until the owner sets them up. Pure, unit-tested.

export const NOTIFY_EVENTS = ['urgentStock', 'newDrafts', 'deliveriesDue'] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export interface NotificationSettings {
  web: boolean; // the alert bell
  language: 'th' | 'en'; // of LINE and email messages
  events: Record<NotifyEvent, boolean>; // which alerts go out by LINE / email
  line: { enabled: boolean; token: string; to: string }; // Messaging API channel access token; user or group ID
  email: { enabled: boolean; host: string; port: number; user: string; pass: string; from: string; to: string };
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  web: true,
  language: 'th',
  events: { urgentStock: true, newDrafts: true, deliveriesDue: true },
  line: { enabled: false, token: '', to: '' },
  email: { enabled: false, host: '', port: 465, user: '', pass: '', from: '', to: '' },
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);

/** Stored JSON → full settings (defaults for anything missing or broken). */
export function parseNotificationSettings(json: string | null | undefined): NotificationSettings {
  let raw: Record<string, unknown> = {};
  try { raw = obj(json ? JSON.parse(json) : {}); } catch { /* defaults */ }
  const d = DEFAULT_NOTIFICATIONS;
  const ev = obj(raw.events);
  const line = obj(raw.line);
  const email = obj(raw.email);
  const port = Number(email.port);
  return {
    web: bool(raw.web, d.web),
    language: raw.language === 'en' ? 'en' : 'th',
    events: Object.fromEntries(NOTIFY_EVENTS.map((e) => [e, bool(ev[e], d.events[e])])) as NotificationSettings['events'],
    line: { enabled: bool(line.enabled, false), token: str(line.token, ''), to: str(line.to, '') },
    email: {
      enabled: bool(email.enabled, false), host: str(email.host, ''), port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 465,
      user: str(email.user, ''), pass: str(email.pass, ''), from: str(email.from, ''), to: str(email.to, ''),
    },
  };
}

export type NotificationPatch = Partial<Omit<NotificationSettings, 'events' | 'line' | 'email'>> & {
  events?: Partial<NotificationSettings['events']>;
  line?: Partial<NotificationSettings['line']>;
  email?: Partial<NotificationSettings['email']>;
};

/** Applies a change. Secrets (LINE token, email password) left out are kept. */
export function applyPatch(s: NotificationSettings, p: NotificationPatch): NotificationSettings {
  return {
    ...s,
    ...(p.web !== undefined ? { web: p.web } : {}),
    ...(p.language ? { language: p.language } : {}),
    events: { ...s.events, ...p.events },
    line: { ...s.line, ...p.line },
    email: { ...s.email, ...p.email },
  };
}

/** What the settings page gets: secrets replaced by "is one saved?". */
export function masked(s: NotificationSettings) {
  const { token, ...line } = s.line;
  const { pass, ...email } = s.email;
  return { ...s, line: { ...line, hasToken: token !== '' }, email: { ...email, hasPassword: pass !== '' } };
}

/** Why a channel cannot send yet, or null when it can. */
export function channelProblem(s: NotificationSettings, channel: 'line' | 'email'): string | null {
  if (channel === 'line') {
    if (!s.line.token) return 'Enter the LINE channel access token.';
    if (!s.line.to) return 'Enter the LINE user or group ID to send to.';
    return null;
  }
  const e = s.email;
  if (!e.host || !e.user || !e.pass) return 'Enter the mail server, user name and password.';
  if (!e.from || !e.to) return 'Enter the sender and at least one receiver address.';
  return null;
}

export const emailReceivers = (to: string) => to.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

// ---- Message texts -------------------------------------------------------

export type Notice =
  | { kind: 'draft'; label: string; supplier: string; lines: number; urgent: boolean; added: boolean }
  | { kind: 'urgent'; items: { name: string; quantity: string; unit: string }[] }
  | { kind: 'deliveries'; due: { label: string; supplier: string; late: boolean }[] }
  | { kind: 'test' };

export const noticeEvent = (n: Notice): NotifyEvent | null =>
  n.kind === 'draft' ? 'newDrafts' : n.kind === 'urgent' ? 'urgentStock' : n.kind === 'deliveries' ? 'deliveriesDue' : null;

const T = {
  en: {
    draftNew: (n: Extract<Notice, { kind: 'draft' }>) => `${n.urgent ? 'Urgent draft order' : 'Draft order'} ${n.label} for ${n.supplier} is ready (${n.lines} ${n.lines === 1 ? 'ingredient' : 'ingredients'}). Check it and send it in the app.`,
    draftAdded: (n: Extract<Notice, { kind: 'draft' }>) => `${n.lines} more ${n.lines === 1 ? 'ingredient was' : 'ingredients were'} added to draft order ${n.label} for ${n.supplier}. Check it and send it in the app.`,
    urgentTitle: 'Urgent: stock is very low',
    urgentLine: (i: { name: string; quantity: string; unit: string }) => `• ${i.name}: ${i.quantity} ${i.unit} left`,
    deliveriesTitle: 'Deliveries due today',
    deliveryLine: (d: { label: string; supplier: string; late: boolean }) => `• ${d.label} ${d.supplier}${d.late ? ' (late)' : ''}`,
    test: 'Test message from the restaurant app. Notifications work.',
    subject: { draft: 'Draft order ready', urgent: 'Urgent stock', deliveries: 'Deliveries due today', test: 'Test message' },
  },
  th: {
    draftNew: (n: Extract<Notice, { kind: 'draft' }>) => `${n.urgent ? 'ร่างใบสั่งซื้อด่วน' : 'ร่างใบสั่งซื้อ'} ${n.label} ถึง ${n.supplier} พร้อมแล้ว (วัตถุดิบ ${n.lines} รายการ) ตรวจและส่งในแอป`,
    draftAdded: (n: Extract<Notice, { kind: 'draft' }>) => `เพิ่มวัตถุดิบ ${n.lines} รายการในร่างใบสั่งซื้อ ${n.label} ถึง ${n.supplier} แล้ว ตรวจและส่งในแอป`,
    urgentTitle: 'ด่วน: สต็อกเหลือน้อยมาก',
    urgentLine: (i: { name: string; quantity: string; unit: string }) => `• ${i.name}: เหลือ ${i.quantity} ${i.unit}`,
    deliveriesTitle: 'ของที่ต้องมาส่งวันนี้',
    deliveryLine: (d: { label: string; supplier: string; late: boolean }) => `• ${d.label} ${d.supplier}${d.late ? ' (เลยกำหนด)' : ''}`,
    test: 'ข้อความทดสอบจากแอปร้านอาหาร การแจ้งเตือนใช้งานได้',
    subject: { draft: 'ร่างใบสั่งซื้อพร้อมแล้ว', urgent: 'สต็อกด่วน', deliveries: 'ของที่ต้องมาส่งวันนี้', test: 'ข้อความทดสอบ' },
  },
};

/** Subject (email) and text (LINE and email) of a notice. */
export function noticeMessage(n: Notice, lang: 'th' | 'en', restaurant: string): { subject: string; text: string } {
  const t = T[lang];
  const prefix = restaurant ? `[${restaurant}] ` : '';
  switch (n.kind) {
    case 'draft':
      return { subject: `${prefix}${t.subject.draft} ${n.label}`, text: `${prefix}${n.added ? t.draftAdded(n) : t.draftNew(n)}` };
    case 'urgent':
      return { subject: `${prefix}${t.subject.urgent}`, text: [`${prefix}${t.urgentTitle}`, ...n.items.map(t.urgentLine)].join('\n') };
    case 'deliveries':
      return { subject: `${prefix}${t.subject.deliveries}`, text: [`${prefix}${t.deliveriesTitle}`, ...n.due.map(t.deliveryLine)].join('\n') };
    case 'test':
      return { subject: `${prefix}${t.subject.test}`, text: `${prefix}${t.test}` };
  }
}
