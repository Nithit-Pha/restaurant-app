// A small SMTP client for notification emails (Step 3g), so no extra package
// is needed. Supports SSL (port 465) and STARTTLS (587), AUTH PLAIN / LOGIN,
// one plain-text UTF-8 message. Works with Gmail (app password) and Outlook.
import net from 'net';
import tls from 'tls';
import { randomUUID } from 'crypto';

export interface SmtpConfig {
  host: string;
  port: number; // 465 = SSL from the start; anything else = STARTTLS when offered
  user: string;
  pass: string;
  from: string;
  tlsRejectUnauthorized?: boolean; // tests only
  allowPlain?: boolean; // tests only: a local fake server without encryption
  timeoutMs?: number;
}

export interface Mail { to: string[]; subject: string; text: string }

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const wrap76 = (s: string) => s.replace(/.{1,76}/g, (m) => `${m}\r\n`);
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const address = (s: string) => s.replace(/^.*<([^>]+)>.*$/, '$1').trim();

/** The message: headers + base64 text body (Thai safe). */
export function buildMessage(from: string, mail: Mail, now = new Date()): string {
  const domain = address(from).split('@')[1] || 'localhost';
  return [
    `From: ${from}`,
    `To: ${mail.to.join(', ')}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(mail.text.replace(/\r?\n/g, '\r\n'))),
  ].join('\r\n');
}

/** Reads SMTP replies (one reply can span several "250-" lines). */
class Replies {
  private buf = '';
  private lines: string[] = [];
  private ready: { code: number; text: string }[] = [];
  private waiting: { resolve: (r: { code: number; text: string }) => void; reject: (e: Error) => void }[] = [];
  private error: Error | null = null;

  feed(chunk: string) {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf('\r\n')) >= 0) {
      const line = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 2);
      this.lines.push(line);
      if (/^\d{3}( |$)/.test(line)) {
        const reply = { code: Number(line.slice(0, 3)), text: this.lines.map((l) => l.slice(4)).join('\n') };
        this.lines = [];
        const w = this.waiting.shift();
        if (w) w.resolve(reply); else this.ready.push(reply);
      }
    }
  }

  /** The connection broke: everyone waiting gets the error. */
  fail(err: Error) {
    if (this.error) return;
    this.error = err;
    this.waiting.splice(0).forEach((w) => w.reject(err));
  }

  next(): Promise<{ code: number; text: string }> {
    const r = this.ready.shift();
    if (r) return Promise.resolve(r);
    if (this.error) return Promise.reject(this.error);
    return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }));
  }
}

export async function sendMail(cfg: SmtpConfig, mail: Mail): Promise<void> {
  const timeoutMs = cfg.timeoutMs ?? 20_000;
  const tlsOpts = { servername: cfg.host, rejectUnauthorized: cfg.tlsRejectUnauthorized ?? true };
  let socket: net.Socket = cfg.port === 465
    ? tls.connect({ host: cfg.host, port: cfg.port, ...tlsOpts })
    : net.connect({ host: cfg.host, port: cfg.port });
  let replies = new Replies();

  const attach = (s: net.Socket, r: Replies) => {
    s.setEncoding('utf8');
    s.setTimeout(timeoutMs, () => { r.fail(new Error('The mail server did not answer in time.')); s.destroy(); });
    s.on('data', (d: string) => r.feed(d));
    s.on('error', (e) => r.fail(e));
    s.on('close', () => r.fail(new Error('The mail server closed the connection.')));
  };
  attach(socket, replies);

  const expect = async (ok: number[], what: string) => {
    const r = await replies.next();
    if (!ok.includes(r.code)) throw new Error(`Mail server refused ${what}: ${r.code} ${r.text}`.trim());
    return r;
  };
  const cmd = (line: string, ok: number[], what: string) => { socket.write(`${line}\r\n`); return expect(ok, what); };

  try {
    await expect([220], 'the connection');
    let ehlo = await cmd('EHLO restaurant-app', [250], 'EHLO');
    if (cfg.port !== 465 && /STARTTLS/i.test(ehlo.text)) {
      await cmd('STARTTLS', [220], 'STARTTLS');
      const plain = socket;
      plain.removeAllListeners('data');
      plain.removeAllListeners('close');
      plain.setTimeout(0);
      replies = new Replies();
      socket = tls.connect({ socket: plain, ...tlsOpts });
      attach(socket, replies);
      await new Promise<void>((resolve, reject) => { socket.once('secureConnect', () => resolve()); socket.once('error', reject); });
      ehlo = await cmd('EHLO restaurant-app', [250], 'EHLO');
    } else if (cfg.port !== 465 && !cfg.allowPlain) {
      // Never send the password unencrypted.
      throw new Error('The mail server does not offer encryption (STARTTLS). Use port 465 or 587.');
    }
    if (/AUTH[ =][^\n]*PLAIN/i.test(ehlo.text)) {
      await cmd(`AUTH PLAIN ${b64(`\0${cfg.user}\0${cfg.pass}`)}`, [235], 'the user name or password');
    } else {
      await cmd('AUTH LOGIN', [334], 'AUTH LOGIN');
      await cmd(b64(cfg.user), [334], 'the user name');
      await cmd(b64(cfg.pass), [235], 'the user name or password');
    }
    await cmd(`MAIL FROM:<${address(cfg.from)}>`, [250], 'the sender');
    for (const to of mail.to) await cmd(`RCPT TO:<${address(to)}>`, [250, 251], `the receiver ${to}`);
    await cmd('DATA', [354], 'DATA');
    const body = buildMessage(cfg.from, mail).replace(/^\./gm, '..'); // dot-stuffing
    await cmd(`${body}\r\n.`, [250], 'the message');
    socket.write('QUIT\r\n');
  } finally {
    socket.end();
    setTimeout(() => socket.destroy(), 1000).unref?.();
  }
}
