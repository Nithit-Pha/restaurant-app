'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Order } from '../../../api/apiSlice';

const SOUND_KEY = 'staff.newOrderSound';

function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * Staff alert for new orders: a short two-tone chime when a PENDING order
 * appears that was not there on the previous poll, and "(n) New orders" in the
 * browser tab title while any are waiting.
 *
 * Browsers only allow sound after the person has clicked on the page, so the
 * page shows a "Sound on" button that also unlocks audio.
 */
export function useNewOrderAlert(orders: Order[] | undefined) {
  const t = useTranslations('staffOrders');
  const [soundOn, setSoundOn] = useState(true);
  const audioRef = useRef<AudioContext | null>(null);
  const seenRef = useRef<Set<string> | null>(null); // null until the first load

  useEffect(() => setSoundOn(readSoundPref()), []);

  const ensureAudio = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioRef.current) audioRef.current = new Ctx();
    if (audioRef.current.state === 'suspended') void audioRef.current.resume();
    return audioRef.current;
  }, []);

  const chime = useCallback(() => {
    const ctx = ensureAudio();
    if (!ctx) return;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }, [ensureAudio]);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      const next = !on;
      try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* private mode */ }
      if (next) chime(); // also unlocks audio after this click
      return next;
    });
  }, [chime]);

  const pending = (orders ?? []).filter((o) => o.status === 'PENDING');
  const pendingCount = pending.length;

  // Chime for PENDING orders we have not seen before (not on the first load).
  useEffect(() => {
    if (!orders) return;
    const ids = new Set(pending.map((o) => o.id));
    if (seenRef.current) {
      const fresh = [...ids].some((id) => !seenRef.current!.has(id));
      if (fresh && soundOn) chime();
      ids.forEach((id) => seenRef.current!.add(id));
    } else {
      seenRef.current = ids;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // Tab title shows how many orders wait for a decision.
  useEffect(() => {
    const base = t('tabTitle');
    document.title = pendingCount > 0 ? `(${pendingCount}) ${t('tabNewOrders', { count: pendingCount })} · ${base}` : base;
    return () => { document.title = base; };
  }, [pendingCount, t]);

  return { soundOn, toggleSound, pendingCount };
}
