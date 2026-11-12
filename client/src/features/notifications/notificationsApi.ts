// Settings → Notifications (Step 3g): web bell, LINE and email. Owner only.
import { apiSlice } from '../../api/apiSlice';

export type NotifyEvent = 'urgentStock' | 'newDrafts' | 'deliveriesDue';
export const NOTIFY_EVENTS: NotifyEvent[] = ['urgentStock', 'newDrafts', 'deliveriesDue'];

export interface NotificationView {
  settings: {
    web: boolean;
    language: 'th' | 'en';
    events: Record<NotifyEvent, boolean>;
    line: { enabled: boolean; to: string; hasToken: boolean };
    email: { enabled: boolean; host: string; port: number; user: string; from: string; to: string; hasPassword: boolean };
  };
  status: Record<'line' | 'email', { at: string; ok: boolean; error?: string } | null>;
}

export interface NotificationPatch {
  web?: boolean;
  language?: 'th' | 'en';
  events?: Partial<Record<NotifyEvent, boolean>>;
  line?: Partial<{ enabled: boolean; token: string; to: string }>;
  email?: Partial<{ enabled: boolean; host: string; port: number; user: string; pass: string; from: string; to: string }>;
}

const api = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getNotifications: builder.query<NotificationView, void>({
      query: () => '/notifications',
      providesTags: ['Settings'],
    }),
    updateNotifications: builder.mutation<NotificationView, NotificationPatch>({
      query: (body) => ({ url: '/notifications', method: 'PUT', body }),
      invalidatesTags: ['Settings'], // the bell reads the web switch
    }),
    testNotification: builder.mutation<NotificationView, 'line' | 'email'>({
      query: (channel) => ({ url: '/notifications/test', method: 'POST', body: { channel } }),
      invalidatesTags: ['Settings'],
    }),
  }),
});

export const { useGetNotificationsQuery, useUpdateNotificationsMutation, useTestNotificationMutation } = api;
