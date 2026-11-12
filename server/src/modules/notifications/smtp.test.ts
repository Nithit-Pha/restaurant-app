import net from 'net';
import { afterEach, describe, expect, it } from 'vitest';
import { buildMessage, sendMail } from './smtp';

/** A tiny fake mail server: records commands and the message. */
function fakeServer(opts: { auth?: 'PLAIN' | 'LOGIN'; rejectAuth?: boolean; starttls?: boolean } = {}) {
  const seen: string[] = [];
  let data = '';
  const server = net.createServer((sock) => {
    let inData = false;
    let buf = '';
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; sock.write('250 queued\r\n'); } else data += `${line}\r\n`;
          continue;
        }
        seen.push(line);
        if (line.startsWith('EHLO')) sock.write(`250-fake\r\n${opts.starttls ? '250-STARTTLS\r\n' : ''}250 AUTH ${opts.auth ?? 'PLAIN LOGIN'}\r\n`);
        else if (line.startsWith('AUTH PLAIN')) sock.write(opts.rejectAuth ? '535 5.7.8 bad credentials\r\n' : '235 ok\r\n');
        else if (line === 'AUTH LOGIN') sock.write('334 VXNlcm5hbWU6\r\n');
        else if (seen[seen.length - 2] === 'AUTH LOGIN') sock.write('334 UGFzc3dvcmQ6\r\n');
        else if (seen[seen.length - 3] === 'AUTH LOGIN') sock.write(opts.rejectAuth ? '535 no\r\n' : '235 ok\r\n');
        else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) sock.write('250 ok\r\n');
        else if (line === 'DATA') { inData = true; sock.write('354 go\r\n'); }
        else if (line === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('500 what\r\n');
      }
    });
  });
  return new Promise<{ port: number; seen: string[]; data: () => string; close: () => void }>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      port: (server.address() as net.AddressInfo).port, seen, data: () => data, close: () => server.close(),
    }));
  });
}

let close = () => {};
afterEach(() => close());

const cfg = (port: number) => ({ host: '127.0.0.1', port, user: 'shop@example.com', pass: 'app-pass', from: 'Baan <shop@example.com>', allowPlain: true, timeoutMs: 3000 });
const MAIL = { to: ['owner@example.com', 'chef@example.com'], subject: 'ร่างใบสั่งซื้อ PO-0012', text: 'สวัสดี\n.dot line' };

describe('smtp', () => {
  it('sends with AUTH PLAIN: sender, receivers and a Thai-safe message', async () => {
    const s = await fakeServer();
    close = s.close;
    await sendMail(cfg(s.port), MAIL);
    expect(s.seen).toContain(`AUTH PLAIN ${Buffer.from('\0shop@example.com\0app-pass').toString('base64')}`);
    expect(s.seen).toContain('MAIL FROM:<shop@example.com>');
    expect(s.seen).toEqual(expect.arrayContaining(['RCPT TO:<owner@example.com>', 'RCPT TO:<chef@example.com>']));
    const msg = s.data();
    expect(msg).toContain(`Subject: =?UTF-8?B?${Buffer.from(MAIL.subject).toString('base64')}?=`);
    const body = msg.split('\r\n\r\n')[1].replace(/\r\n/g, '');
    expect(Buffer.from(body, 'base64').toString('utf8')).toBe('สวัสดี\r\n.dot line');
  });

  it('falls back to AUTH LOGIN', async () => {
    const s = await fakeServer({ auth: 'LOGIN' });
    close = s.close;
    await sendMail(cfg(s.port), MAIL);
    expect(s.seen).toContain('AUTH LOGIN');
    expect(s.seen).toContain(Buffer.from('app-pass').toString('base64'));
  });

  it('reports a wrong password', async () => {
    const s = await fakeServer({ rejectAuth: true });
    close = s.close;
    await expect(sendMail(cfg(s.port), MAIL)).rejects.toThrow(/user name or password: 535/);
  });

  it('never sends the password without encryption', async () => {
    const s = await fakeServer();
    close = s.close;
    await expect(sendMail({ ...cfg(s.port), allowPlain: false }, MAIL)).rejects.toThrow(/encryption/);
    expect(s.seen.some((l) => l.startsWith('AUTH'))).toBe(false);
  });

  it('reports a server that is not there', async () => {
    await expect(sendMail({ ...cfg(1), timeoutMs: 1000 }, MAIL)).rejects.toThrow();
  });

  it('builds a plain ASCII subject as is', () => {
    expect(buildMessage('a@b.c', { to: ['x@y.z'], subject: 'Hello', text: 'Hi' })).toContain('Subject: Hello\r\n');
  });
});
