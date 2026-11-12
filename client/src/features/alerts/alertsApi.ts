// The alert bell (Step 3f): worked out on the server from the current state.
import { apiSlice } from '../../api/apiSlice';

export type AlertKind = 'urgentStock' | 'draftsWaiting' | 'deliveriesDue' | 'priceMissing';

export interface Alert {
  kind: AlertKind;
  tone: 'danger' | 'warning' | 'info';
  count: number;
  names: string[];
  extra?: number; // urgent drafts / late deliveries
  href: string;
}

const api = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Stock and purchase order changes (also live events) reload it.
    // web: false = the owner switched the bell off (Settings → Notifications).
    getAlerts: builder.query<{ web: boolean; items: Alert[] }, void>({
      query: () => '/alerts',
      providesTags: ['Stock', 'PurchaseOrder', 'Settings'],
    }),
  }),
});

export const { useGetAlertsQuery } = api;
