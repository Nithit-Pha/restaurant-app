'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { ArrowLeft, Printer, QrCode, RefreshCw } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  useGetQrCodesQuery, useGetRestaurantQuery, useRegenerateQrMutation, type QrTable,
} from '../../../../../src/api/apiSlice';
import { ConfirmDialog } from '../../../../../src/features/admin/tables/ZoneDialogs';
import { useRequireRole } from '../../../../../src/routes/useAuthGuard';
import {
  Alert, Button, EmptyState, Field, Input, LoadingBlock, PageContainer, PageHeader, Select, buttonClasses, useToast,
} from '../../../../../src/components/ui';

const BASE_KEY = 'qrCodes.baseUrl';
const readBase = () => { try { return localStorage.getItem(BASE_KEY); } catch { return null; } };
const saveBase = (v: string) => { try { localStorage.setItem(BASE_KEY, v); } catch { /* ignore */ } };
const isLocalOnly = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url.trim());

function QrCard({ table, link, restaurant, onRenew }: { table: QrTable; link: string; restaurant: string; onRenew: () => void }) {
  const t = useTranslations('qrCodes');
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(link, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => { alive = false; };
  }, [link]);

  return (
    <li className="flex break-inside-avoid flex-col items-center gap-2 rounded-card border border-line bg-surface p-4 text-center print:border-black">
      <p className="text-sm text-fg-muted">{restaurant}</p>
      <p className="text-2xl font-semibold text-fg">{t('table', { label: table.label })}</p>
      {src ? <img src={src} alt={t('qrAlt', { label: table.label })} className="h-44 w-44" /> : <div className="h-44 w-44 animate-pulse rounded bg-surface-muted" />}
      <p className="text-sm font-medium text-fg">{t('scanToOrder')}</p>
      <p className="text-xs text-fg-muted">สแกนเพื่อสั่งอาหาร</p>
      <Button size="sm" variant="ghost" icon={RefreshCw} onClick={onRenew} className="print:hidden">{t('renew')}</Button>
    </li>
  );
}

export default function QrCodesPage() {
  const t = useTranslations('qrCodes');
  const locale = useLocale();
  const toast = useToast();
  const { ready } = useRequireRole('SUPER_ADMIN');
  const { data: zones = [], isLoading } = useGetQrCodesQuery(undefined, { skip: !ready });
  const { data: restaurant } = useGetRestaurantQuery(undefined, { skip: !ready });
  const [renewQr, { isLoading: renewing }] = useRegenerateQrMutation();
  const [base, setBase] = useState('');
  const [lang, setLang] = useState(locale);
  const [renew, setRenew] = useState<QrTable | null>(null);

  useEffect(() => { setBase(readBase() ?? window.location.origin); }, []);
  const cleanBase = base.trim().replace(/\/+$/, '');
  const linkFor = (tb: QrTable) => `${cleanBase}/${lang}/t/${tb.qrToken}`;

  const doRenew = async () => {
    if (!renew) return;
    try {
      await renewQr(renew.id).unwrap();
      toast({ tone: 'success', title: t('renewed', { label: renew.label }), description: t('renewedHint') });
    } catch {
      toast({ tone: 'error', title: t('renewFailed') });
    }
    setRenew(null);
  };

  if (!ready) return null;

  return (
    <PageContainer wide>
      <div className="print:hidden">
        <PageHeader
          eyebrow={t('eyebrow')}
          title={t('title')}
          description={t('description')}
          actions={
            <>
              <Link href="/admin/tables" className={buttonClasses('ghost')}><ArrowLeft size={16} aria-hidden /> {t('back')}</Link>
              <Button icon={Printer} onClick={() => window.print()} disabled={!zones.length}>{t('print')}</Button>
            </>
          }
        />
        <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label={t('address')} htmlFor="qr-base" hint={t('addressHint')}>
            <Input id="qr-base" value={base} inputMode="url" onChange={(e) => { setBase(e.target.value); saveBase(e.target.value); }} />
          </Field>
          <Field label={t('language')} htmlFor="qr-lang">
            <Select id="qr-lang" value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="th">ไทย</option>
              <option value="en">English</option>
            </Select>
          </Field>
        </div>
        {isLocalOnly(cleanBase) && <Alert tone="warning" title={t('localTitle')} className="mb-6">{t('localText')}</Alert>}
      </div>

      {isLoading ? (
        <LoadingBlock label={t('loading')} />
      ) : !zones.length ? (
        <EmptyState icon={QrCode} title={t('emptyTitle')} description={t('emptyDescription')}
          action={<Link href="/admin/tables" className={buttonClasses()}>{t('toFloorPlan')}</Link>} />
      ) : (
        zones.map((z) => (
          <section key={z.id} className="mb-8 break-inside-avoid">
            <h2 className="mb-3 text-lg font-semibold text-fg print:hidden">{z.name}</h2>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
              {z.tables.map((tb) => (
                <QrCard key={tb.id} table={tb} link={linkFor(tb)} restaurant={restaurant?.name ?? ''} onRenew={() => setRenew(tb)} />
              ))}
            </ul>
          </section>
        ))
      )}

      <ConfirmDialog
        open={renew !== null}
        title={t('renewTitle', { label: renew?.label ?? '' })}
        description={t('renewDescription')}
        confirmLabel={t('renewConfirm')}
        busy={renewing}
        onClose={() => setRenew(null)}
        onConfirm={doRenew}
      />
    </PageContainer>
  );
}
