'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Save } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { apiErrorMessage } from '@/lib/localized';
import {
  PERMISSION_KEYS, useGetPermissionsQuery, useUpdatePermissionsMutation, type Permission, type PermissionSet,
} from '../../../../../src/features/permissions/permissionsApi';
import { useRequireRole } from '../../../../../src/routes/useAuthGuard';
import { Alert, Button, Card, LoadingBlock, PageContainer, PageHeader, Switch, useToast } from '../../../../../src/components/ui';

/** Owner: what Staff may do. The owner may always do everything. */
export default function PermissionsPage() {
  const t = useTranslations('permissions');
  const locale = useLocale();
  const toast = useToast();
  const { ready } = useRequireRole('SUPER_ADMIN');
  const { data, isLoading } = useGetPermissionsQuery(undefined, { skip: !ready });
  const [save, { isLoading: saving }] = useUpdatePermissionsMutation();
  const [edits, setEdits] = useState<Partial<PermissionSet>>({});
  const [error, setError] = useState('');

  if (!ready) return null;
  const value = (p: Permission) => edits[p] ?? data?.staff[p] ?? false;
  const dirty = PERMISSION_KEYS.some((p) => edits[p] !== undefined && edits[p] !== data?.staff[p]);

  const onSave = async () => {
    setError('');
    try {
      await save(edits).unwrap();
      setEdits({});
      toast({ title: t('saved') });
    } catch (err) {
      setError(apiErrorMessage(err, locale, t('saveFailed')));
    }
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
        actions={<Button icon={Save} loading={saving} disabled={!dirty} onClick={onSave}>{t('save')}</Button>}
      />
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      <Card className="divide-y divide-line">
        {isLoading || !data ? (
          <LoadingBlock label={t('loading')} />
        ) : (
          PERMISSION_KEYS.map((p) => (
            <div key={p} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{t(`item.${p.replace('.', '_')}.title`)}</p>
                <p className="mt-0.5 text-sm text-fg-muted">{t(`item.${p.replace('.', '_')}.hint`)}</p>
              </div>
              <Switch
                checked={value(p)}
                onChange={(on) => setEdits((e) => ({ ...e, [p]: on }))}
                label={t(`item.${p.replace('.', '_')}.title`)}
                hideLabel
              />
            </div>
          ))
        )}
      </Card>
      <p className="mt-3 text-xs text-fg-muted">{t('ownerNote')}</p>
    </PageContainer>
  );
}
