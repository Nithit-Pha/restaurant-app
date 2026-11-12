'use client';

import { useCallback, useRef, useState } from 'react';

const LIMIT = 50;

/**
 * Undo / redo for the floor plan editor.
 * - commit(next): a finished change (add, delete, typed value).
 * - During a drag, call begin() once, preview(next) on every move and end()
 *   on release: the whole drag becomes one undo step (none if nothing moved).
 */
export function useLayoutHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const gesture = useRef<T | null>(null);
  const presentRef = useRef(state.present);
  presentRef.current = state.present;

  const commit = useCallback((next: T) => {
    setState((s) => ({ past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] }));
  }, []);

  const begin = useCallback(() => {
    gesture.current = presentRef.current;
  }, []);

  const preview = useCallback((next: T) => setState((s) => ({ ...s, present: next })), []);

  const end = useCallback(() => {
    const start = gesture.current;
    gesture.current = null;
    if (start === null) return;
    setState((s) => (s.present === start ? s : { past: [...s.past, start].slice(-LIMIT), present: s.present, future: [] }));
  }, []);

  const undo = useCallback(() => {
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  /** Start over from a saved state, with no undo history. */
  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [] }), []);

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit, begin, preview, end, undo, redo, reset,
  };
}
