import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATIONS, applyPatch, channelProblem, emailReceivers, masked, noticeEvent, noticeMessage, parseNotificationSettings,
} from './notifications.rules';

describe('notification settings', () => {
  it('web on, LINE and email off by default; broken JSON gives defaults', () => {
    expect(parseNotificationSettings(null)).toEqual(DEFAULT_NOTIFICATIONS);
    expect(parseNotificationSettings('{oops')).toEqual(DEFAULT_NOTIFICATIONS);
    expect(DEFAULT_NOTIFICATIONS).toMatchObject({ web: true, line: { enabled: false }, email: { enabled: false } });
  });

  it('keeps stored values and fixes bad ones', () => {
    const s = parseNotificationSettings(JSON.stringify({ web: false, language: 'xx', events: { newDrafts: false }, email: { port: 99999, host: 'smtp.gmail.com' } }));
    expect(s).toMatchObject({ web: false, language: 'th', events: { newDrafts: false, urgentStock: true }, email: { port: 465, host: 'smtp.gmail.com' } });
  });

  it('a change keeps secrets that were left out, and the page never sees them', () => {
    const s = applyPatch(DEFAULT_NOTIFICATIONS, { line: { token: 'secret', to: 'U123', enabled: true } });
    const s2 = applyPatch(s, { line: { enabled: false } });
    expect(s2.line).toEqual({ enabled: false, token: 'secret', to: 'U123' });
    const m = masked(s2);
    expect(m.line).toEqual({ enabled: false, to: 'U123', hasToken: true });
    expect(JSON.stringify(m)).not.toContain('secret');
    expect(masked(DEFAULT_NOTIFICATIONS).email.hasPassword).toBe(false);
  });

  it('says what is missing before a channel can send', () => {
    expect(channelProblem(DEFAULT_NOTIFICATIONS, 'line')).toMatch(/token/);
    expect(channelProblem(applyPatch(DEFAULT_NOTIFICATIONS, { line: { token: 't', to: 'U1' } }), 'line')).toBeNull();
    expect(channelProblem(DEFAULT_NOTIFICATIONS, 'email')).toMatch(/server/);
    const mail = applyPatch(DEFAULT_NOTIFICATIONS, { email: { host: 'h', user: 'u', pass: 'p', from: 'a@b.c', to: 'x@y.z' } });
    expect(channelProblem(mail, 'email')).toBeNull();
    expect(emailReceivers('a@b.c, d@e.f;g@h.i ')).toEqual(['a@b.c', 'd@e.f', 'g@h.i']);
  });
});

describe('notification texts', () => {
  it('writes Thai and English messages with the restaurant name', () => {
    const draft = { kind: 'draft' as const, label: 'PO-0012', supplier: 'Talad Thai', lines: 3, urgent: false, added: false };
    expect(noticeMessage(draft, 'en', 'Baan')).toEqual({
      subject: '[Baan] Draft order ready PO-0012',
      text: '[Baan] Draft order PO-0012 for Talad Thai is ready (3 ingredients). Check it and send it in the app.',
    });
    expect(noticeMessage({ ...draft, urgent: true }, 'th', '').text).toBe('ร่างใบสั่งซื้อด่วน PO-0012 ถึง Talad Thai พร้อมแล้ว (วัตถุดิบ 3 รายการ) ตรวจและส่งในแอป');
    expect(noticeMessage({ kind: 'urgent', items: [{ name: 'Rice', quantity: '4', unit: 'kg' }] }, 'en', '').text).toBe('Urgent: stock is very low\n• Rice: 4 kg left');
    expect(noticeMessage({ kind: 'deliveries', due: [{ label: 'PO-0005', supplier: 'Farm', late: true }] }, 'th', '').text).toBe('ของที่ต้องมาส่งวันนี้\n• PO-0005 Farm (เลยกำหนด)');
  });

  it('maps notices to the alert switches', () => {
    expect(noticeEvent({ kind: 'test' })).toBeNull();
    expect(noticeEvent({ kind: 'urgent', items: [] })).toBe('urgentStock');
  });
});
