'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, CheckCircle2, Mail, MessageCircle, Save, Send, XCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { apiErrorMessage } from '@/lib/localized';
import { formatDate } from '@/lib/format';
import {
  NOTIFY_EVENTS, useGetNotificationsQuery, useTestNotificationMutation, useUpdateNotificationsMutation,
  type NotificationPatch, type NotificationView,
} from '../../../../../src/features/notifications/notificationsApi';
import { useRequireRole } from '../../../../../src/routes/useAuthGuard';
import {
  Alert, Button, Card, CardBody, CardHeader, Field, Input, LoadingBlock, PageContainer, PageHeader, Select, Switch, checkboxClasses, useToast,
} from '../../../../../src/components/ui';

type Form = Omit<NotificationView['settings'], 'line' | 'email'> & {
  line: { enabled: boolean; to: string; token: string };
  email: { enabled: boolean; host: string; port: string; user: string; from: string; to: string; pass: string };
};

const toForm = (s: NotificationView['settings']): Form => ({
  web: s.web,
  language: s.language,
  events: { ...s.events },
  line: { enabled: s.line.enabled, to: s.line.to, token: '' },
  email: { enabled: s.email.enabled, host: s.email.host, port: String(s.email.port), user: s.email.user, from: s.email.from, to: s.email.to, pass: '' },
});

const PRESETS = [
  { name: 'Gmail', host: 'smtp.gmail.com', port: '465' },
  { name: 'Outlook', host: 'smtp-mail.outlook.com', port: '587' },
];

/** Owner: the alert bell (web), LINE and email. LINE and email are off until set up. */
export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const toast = useToast();
  const { ready } = useRequireRole('SUPER_ADMIN');
  const { data, isLoading } = useGetNotificationsQuery(undefined, { skip: !ready });
  const [update, { isLoading: saving }] = useUpdateNotificationsMutation();
  const [test, { isLoading: testing, originalArgs: testingChannel }] = useTestNotificationMutation();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { if (data && !form) setForm(toForm(data.settings)); }, [data, form]);
  if (!ready) return null;

  const saved = data ? toForm(data.settings) : null;
  const dirty = !!form && !!saved && JSON.stringify(form) !== JSON.stringify(saved);
  const set = (change: (f: Form) => Form) => setForm((f) => (f ? change(f) : f));

  const patchOf = (f: Form): NotificationPatch => ({
    web: f.web,
    language: f.language,
    events: f.events,
    line: { enabled: f.line.enabled, to: f.line.to.trim(), ...(f.line.token.trim() ? { token: f.line.token.trim() } : {}) },
    email: {
      enabled: f.email.enabled, host: f.email.host.trim(), port: Number(f.email.port) || 465, user: f.email.user.trim(),
      from: f.email.from.trim(), to: f.email.to.trim(), ...(f.email.pass ? { pass: f.email.pass } : {}),
    },
  });

  const save = async (quiet = false): Promise<boolean> => {
    if (!form) return false;
    setError('');
    try {
      const view = await update(patchOf(form)).unwrap();
      setForm(toForm(view.settings));
      if (!quiet) toast({ title: t('saved') });
      return true;
    } catch (err) {
      setError(apiErrorMessage(err, locale, t('saveFailed')));
      return false;
    }
  };

  const sendTest = async (channel: 'line' | 'email') => {
    if (dirty && !(await save(true))) return;
    setError('');
    try {
      await test(channel).unwrap();
      toast({ title: t('testSent', { channel: t(`${channel}.name`) }) });
    } catch (err) {
      setError(apiErrorMessage(err, locale, t('testFailed')));
    }
  };

  const statusLine = (channel: 'line' | 'email') => {
    const s = data?.status[channel];
    if (!s) return null;
    return s.ok ? (
      <p className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 size={14} aria-hidden /> {t('lastOk', { when: formatDate(s.at, locale) })}</p>
    ) : (
      <p className="flex items-start gap-1.5 text-xs text-danger"><XCircle size={14} className="mt-px shrink-0" aria-hidden /> {t('lastFailed', { when: formatDate(s.at, locale), error: s.error ?? '' })}</p>
    );
  };

  return (
    <PageContainer>
      <Link href="/admin/settings" className="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={16} aria-hidden /> {t('back')}
      </Link>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={<Button icon={Save} loading={saving} disabled={!dirty} onClick={() => save()}>{t('save')}</Button>}
      />
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

      {isLoading || !form ? (
        <Card><LoadingBlock label={t('loading')} /></Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader title={t('web.title')} description={t('web.hint')} actions={<Switch checked={form.web} onChange={(v) => set((f) => ({ ...f, web: v }))} label={t('web.title')} hideLabel />} />
          </Card>

          <Card>
            <CardHeader title={t('events.title')} description={t('events.hint')} />
            <CardBody className="space-y-3">
              {NOTIFY_EVENTS.map((e) => (
                <label key={e} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className={`${checkboxClasses} mt-0.5`}
                    checked={form.events[e]}
                    onChange={(ev) => set((f) => ({ ...f, events: { ...f.events, [e]: ev.target.checked } }))}
                  />
                  <span>
                    <span className="block text-sm font-medium text-fg">{t(`events.${e}`)}</span>
                    <span className="block text-xs text-fg-muted">{t(`events.${e}Hint`)}</span>
                  </span>
                </label>
              ))}
              <Field label={t('language')} htmlFor="n-lang" className="max-w-xs pt-2">
                <Select id="n-lang" value={form.language} onChange={(e) => set((f) => ({ ...f, language: e.target.value as 'th' | 'en' }))}>
                  <option value="th">ไทย</option>
                  <option value="en">English</option>
                </Select>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={<span className="flex items-center gap-2"><MessageCircle size={18} aria-hidden /> {t('line.name')}</span>}
              description={t('line.hint')}
              actions={<Switch checked={form.line.enabled} onChange={(v) => set((f) => ({ ...f, line: { ...f.line, enabled: v } }))} label={t('line.enable')} hideLabel />}
            />
            <CardBody className="space-y-4">
              <ol className="list-decimal space-y-1 pl-5 text-xs text-fg-muted">
                <li>{t('line.step1')}</li>
                <li>{t('line.step2')}</li>
                <li>{t('line.step3')}</li>
              </ol>
              <Field label={t('line.token')} htmlFor="n-line-token" hint={data?.settings.line.hasToken ? t('secretSaved') : undefined}>
                <Input
                  id="n-line-token" type="password" autoComplete="off"
                  value={form.line.token}
                  placeholder={data?.settings.line.hasToken ? '••••••••' : ''}
                  onChange={(e) => set((f) => ({ ...f, line: { ...f.line, token: e.target.value } }))}
                />
              </Field>
              <Field label={t('line.to')} htmlFor="n-line-to" hint={t('line.toHint')}>
                <Input id="n-line-to" value={form.line.to} onChange={(e) => set((f) => ({ ...f, line: { ...f.line, to: e.target.value } }))} placeholder="U1234…" />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" icon={Send} loading={testing && testingChannel === 'line'} onClick={() => sendTest('line')}>{t('sendTest')}</Button>
                {statusLine('line')}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={<span className="flex items-center gap-2"><Mail size={18} aria-hidden /> {t('email.name')}</span>}
              description={t('email.hint')}
              actions={<Switch checked={form.email.enabled} onChange={(v) => set((f) => ({ ...f, email: { ...f.email, enabled: v } }))} label={t('email.enable')} hideLabel />}
            />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button key={p.name} variant="ghost" size="sm" onClick={() => set((f) => ({ ...f, email: { ...f.email, host: p.host, port: p.port } }))}>
                    {t('email.preset', { name: p.name })}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-fg-muted">{t('email.gmailHint')}</p>
              <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                <Field label={t('email.host')} htmlFor="n-host">
                  <Input id="n-host" value={form.email.host} onChange={(e) => set((f) => ({ ...f, email: { ...f.email, host: e.target.value } }))} placeholder="smtp.gmail.com" />
                </Field>
                <Field label={t('email.port')} htmlFor="n-port" hint={t('email.portHint')}>
                  <Input id="n-port" type="number" inputMode="numeric" value={form.email.port} onChange={(e) => set((f) => ({ ...f, email: { ...f.email, port: e.target.value } }))} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('email.user')} htmlFor="n-user">
                  <Input id="n-user" autoComplete="off" value={form.email.user} onChange={(e) => set((f) => ({ ...f, email: { ...f.email, user: e.target.value } }))} />
                </Field>
                <Field label={t('email.pass')} htmlFor="n-pass" hint={data?.settings.email.hasPassword ? t('secretSaved') : undefined}>
                  <Input
                    id="n-pass" type="password" autoComplete="new-password"
                    value={form.email.pass}
                    placeholder={data?.settings.email.hasPassword ? '••••••••' : ''}
                    onChange={(e) => set((f) => ({ ...f, email: { ...f.email, pass: e.target.value } }))}
                  />
                </Field>
                <Field label={t('email.from')} htmlFor="n-from">
                  <Input id="n-from" type="email" value={form.email.from} onChange={(e) => set((f) => ({ ...f, email: { ...f.email, from: e.target.value } }))} placeholder="shop@gmail.com" />
                </Field>
                <Field label={t('email.to')} htmlFor="n-to" hint={t('email.toHint')}>
                  <Input id="n-to" value={form.email.to} onChange={(e) => set((f) => ({ ...f, email: { ...f.email, to: e.target.value } }))} placeholder="owner@gmail.com" />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" icon={Send} loading={testing && testingChannel === 'email'} onClick={() => sendTest('email')}>{t('sendTest')}</Button>
                {statusLine('email')}
              </div>
            </CardBody>
          </Card>

          <p className="text-xs text-fg-muted">{t('storageNote')}</p>
        </div>
      )}
    </PageContainer>
  );
}
