// LINE Messaging API push (Step 3g). LINE Notify was shut down in 2025, so this
// uses a LINE Official Account: its channel access token and the user or group ID.
const PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export async function pushLine(token: string, to: string, text: string): Promise<void> {
  const res = await fetch(PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 5000) }] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()) as { message?: string }).message ?? ''; } catch { /* no body */ }
    throw new Error(`LINE refused the message: ${res.status}${detail ? ` ${detail}` : ''}`);
  }
}
