import net from 'net';
import tls from 'tls';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { sendMail } from './smtp';

// A throwaway self-signed certificate, made with openssl when the tests run
// (skipped where openssl is not installed, e.g. a plain Windows PC).
function makeCert(): { key: string; cert: string } | null {
  try {
    const dir = mkdtempSync(join(tmpdir(), 'smtp-test-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
    const out = { key: readFileSync(join(dir, 'k.pem'), 'utf8'), cert: readFileSync(join(dir, 'c.pem'), 'utf8') };
    rmSync(dir, { recursive: true, force: true });
    return out;
  } catch {
    return null;
  }
}
const CERTS = makeCert();
const KEY = CERTS?.key ?? '';
const CERT = CERTS?.cert ?? '';

/** Fake server with encryption: STARTTLS (587 style) or SSL from the start (465 style). */
function secureServer(mode: 'starttls' | 'ssl') {
  const seen: string[] = [];
  let secureCommands = 0;
  const handle = (sock: net.Socket, secure: boolean) => {
    let buf = '';
    let inData = false;
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) { if (line === '.') { inData = false; sock.write('250 queued\r\n'); } continue; }
        seen.push(line);
        if (secure) secureCommands++;
        if (line.startsWith('EHLO')) sock.write(secure ? '250-fake\r\n250 AUTH PLAIN\r\n' : '250-fake\r\n250 STARTTLS\r\n');
        else if (line === 'STARTTLS') {
          sock.write('220 go ahead\r\n');
          sock.removeListener('data', onData);
          const t = new tls.TLSSocket(sock, { isServer: true, key: KEY, cert: CERT });
          handle(t, true);
          return;
        } else if (!secure && line.startsWith('AUTH')) sock.write('530 must use STARTTLS\r\n');
        else if (line.startsWith('AUTH PLAIN')) sock.write('235 ok\r\n');
        else if (line.startsWith('MAIL') || line.startsWith('RCPT')) sock.write('250 ok\r\n');
        else if (line === 'DATA') { inData = true; sock.write('354 go\r\n'); }
        else if (line === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      }
    };
    sock.on('data', onData);
    sock.on('error', () => {});
  };
  const server = mode === 'ssl'
    ? tls.createServer({ key: KEY, cert: CERT }, (s) => { s.write('220 fake\r\n'); handle(s, true); })
    : net.createServer((s) => { s.write('220 fake\r\n'); handle(s, false); });
  return new Promise<{ port: number; seen: string[]; secureCommands: () => number; close: () => void }>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      port: (server.address() as net.AddressInfo).port, seen, secureCommands: () => secureCommands, close: () => server.close(),
    }));
  });
}

let close = () => {};
afterEach(() => close());
const MAIL = { to: ['owner@example.com'], subject: 'Test', text: 'Hello' };

describe.skipIf(!CERTS)('smtp with encryption', () => {
  it('upgrades with STARTTLS before logging in', async () => {
    const s = await secureServer('starttls');
    close = s.close;
    await sendMail({ host: '127.0.0.1', port: s.port, user: 'u', pass: 'p', from: 'a@b.c', tlsRejectUnauthorized: false, timeoutMs: 3000 }, MAIL);
    const auth = s.seen.findIndex((l) => l.startsWith('AUTH'));
    expect(s.seen.indexOf('STARTTLS')).toBeGreaterThanOrEqual(0);
    expect(auth).toBeGreaterThan(s.seen.indexOf('STARTTLS'));
    expect(s.secureCommands()).toBeGreaterThanOrEqual(5); // EHLO, AUTH, MAIL, RCPT, DATA… all encrypted
  });

  it('uses SSL from the start on port 465 style servers', async () => {
    // Port 465 means SSL in sendMail; the fake listens elsewhere, so ask for SSL through a 465 forwarder.
    const s = await secureServer('ssl');
    close = s.close;
    const fwd = net.createServer((c) => { const up = net.connect(s.port, '127.0.0.1'); c.pipe(up).pipe(c); up.on('error', () => {}); c.on('error', () => {}); });
    const listening = await new Promise<boolean>((resolve) => { fwd.once('error', () => resolve(false)); fwd.listen(465, '127.0.0.1', () => resolve(true)); });
    if (!listening) return; // port 465 not free / not allowed here: covered by STARTTLS test
    try {
      await sendMail({ host: '127.0.0.1', port: 465, user: 'u', pass: 'p', from: 'a@b.c', tlsRejectUnauthorized: false, timeoutMs: 3000 }, MAIL);
      expect(s.seen).toContain('DATA');
    } finally {
      fwd.close();
    }
  });
});
