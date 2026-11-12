'use client';

import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';
import { apiSlice } from '../api/apiSlice';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { useEventStream, type LiveEvent } from '../lib/useEventStream';

const LiveContext = createContext({ connected: false });

/** True while staff screens get live updates; pages poll more often when it is false. */
export const useLiveConnected = () => useContext(LiveContext).connected;

type Tag = 'Order' | 'Floor' | 'Visit' | 'Stock' | 'MenuItem' | 'PurchaseOrder';

/**
 * For staff: listens to /api/events and reloads what changed (orders, floor,
 * table visits) through the normal API. Several events in a row are bundled
 * into one reload.
 */
export function LiveUpdatesProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.accessToken);
  const pending = useRef(new Set<Tag>());
  const timer = useRef<number | undefined>(undefined);

  const onEvent = useCallback((e: LiveEvent) => {
    if (e.type === 'stock') {
      // Quantities changed: stock page, low-stock counter, sold-out dishes.
      pending.current.add('Stock');
      pending.current.add('MenuItem');
    } else if (e.type === 'order') pending.current.add('Order');
    else if (e.type === 'purchasing') pending.current.add('PurchaseOrder'); // drafts made, sent or cancelled
    if (e.type === 'table' || e.type === 'floor' || (e.type === 'order' && e.tableId)) {
      pending.current.add('Floor');
      pending.current.add('Visit');
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const tags = [...pending.current];
      pending.current.clear();
      dispatch(apiSlice.util.invalidateTags(tags));
    }, 250);
  }, [dispatch]);

  // An expired token: asking for "me" makes the API layer refresh it.
  const refresh = useCallback(() => {
    void dispatch(apiSlice.endpoints.getMe.initiate(undefined, { forceRefetch: true, subscribe: false }));
  }, [dispatch]);

  const { connected } = useEventStream('/api/events', enabled ? token : null, onEvent, refresh);
  return <LiveContext.Provider value={{ connected: enabled && connected }}>{children}</LiveContext.Provider>;
}
