'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiErrorMessage } from '@/lib/localized';
import { useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { useGetPaymentSettingsQuery, useSetPaymentSettingsMutation } from '../../../api/apiSlice';
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, Field, Input } from '../../../components/ui';

/** Owner: the PromptPay account customers pay into. Empty ID = PromptPay off. */
export default function PaymentSettingsSection({ onSaved, id }: { onSaved: (msg: string) => void; id?: string }) {
  const t = useTranslations('paymentSettings');
  const locale = useLocale();
  const { data } = useGetPaymentSettingsQuery();
  const [save, { isLoading }] = useSetPaymentSettingsMutation();
  const [promptPayId, setPromptPayId] = useState('');
  const [promptPayName, setPromptPayName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (data) {
      setPromptPayId(data.promptPayId);
      setPromptPayName(data.promptPayName);
    }
  }, [data]);
  useUnsavedChanges(Boolean(data && (promptPayId !== data.promptPayId || promptPayName !== data.promptPayName)));

  const submit = async () => {
    setError('');
    try {
      const saved = await save({ promptPayId: promptPayId.trim(), promptPayName: promptPayName.trim() }).unwrap();
      onSaved(saved.promptPayId ? t('nowOn') : t('nowOff'));
    } catch (err) {
      setError(apiErrorMessage(err, locale, t('saveFailed')));
    }
  };

  return (
    <Card id={id} className="scroll-mt-6 lg:scroll-mt-20">
      <CardHeader
        title={t('title')}
        description={t('description')}
        actions={<Badge tone={data?.promptPayId ? 'success' : 'neutral'} dot>{data?.promptPayId ? t('on') : t('cashOnly')}</Badge>}
      />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label={t('id')} htmlFor="promptpay-id" hint={t('idHint')}>
          <Input
            id="promptpay-id"
            inputMode="numeric"
            value={promptPayId}
            onChange={(e) => setPromptPayId(e.target.value)}
            placeholder="08x xxx xxxx"
            aria-describedby="promptpay-id-hint"
            className="tabular-nums"
          />
        </Field>
        <Field label={t('name')} htmlFor="promptpay-name" hint={t('nameHint')}>
          <Input
            id="promptpay-name"
            value={promptPayName}
            onChange={(e) => setPromptPayName(e.target.value)}
            maxLength={100}
            aria-describedby="promptpay-name-hint"
          />
        </Field>
        {error && <Alert tone="danger" className="sm:col-span-2">{error}</Alert>}
      </CardBody>
      <CardFooter>
        <Button onClick={submit} loading={isLoading}>{t('save')}</Button>
      </CardFooter>
    </Card>
  );
}
