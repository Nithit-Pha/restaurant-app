'use client';

import { useEffect, useRef, useState } from 'react';

export interface LiveEvent {
  type: 'order' | 'table' | 'floor' | 'stock';
  orderId?: string;
  tableId?: string | null;
}

/**
 * Server-Sent Events read with fetch(), so the normal "Authorization: Bearer"
 * header can be sent (the browser's EventSource cannot send headers).
 * Reconnects by itself (2 s, then longer up to 30 s). On 401 it calls
 * `onUnauthorized` (refresh the login) and tries again with the new token.
 */
export function useEventStream(
  url: string,
  token: string | null,
  onEvent: (e: LiveEvent) => void,
  onUnauthorized?: () => void,
) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  useEffect(() => {
    if (!token) return;
    const abort = new AbortController();
    let delay = 2000;
    let timer: number | undefined;

    const connect = async () => {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          cache: 'no-store',
          signal: abort.signal,
        });
        if (res.status === 401) {
          unauthorized.current?.(); // a new token restarts this effect
          return;
        }
        if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
        setConnected(true);
        delay = 2000;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let cut: number;
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
            if (!data) continue; // comments: heartbeat, "connected"
            try { handler.current(JSON.parse(data) as LiveEvent); } catch { /* ignore a broken message */ }
          }
        }
      } catch {
        if (abort.signal.aborted) return;
      }
      setConnected(false);
      if (abort.signal.aborted) return;
      timer = window.setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30_000);
    };

    void connect();
    return () => {
      abort.abort();
      window.clearTimeout(timer);
      setConnected(false);
    };
  }, [url, token]);

  return { connected };
}
