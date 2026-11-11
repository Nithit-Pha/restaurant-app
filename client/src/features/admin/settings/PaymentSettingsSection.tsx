'use client';

import { useEffect, useState } from 'react';
import { useGetPaymentSettingsQuery, useSetPaymentSettingsMutation } from '../../../api/apiSlice';
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, Field, Input } from '../../../components/ui';

/** Owner: the PromptPay account customers pay into. Empty ID = PromptPay off. */
export default function PaymentSettingsSection({ onSaved, id }: { onSaved: (msg: string) => void; id?: string }) {
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

  const submit = async () => {
    setError('');
    try {
      const saved = await save({ promptPayId: promptPayId.trim(), promptPayName: promptPayName.trim() }).unwrap();
      onSaved(saved.promptPayId ? 'PromptPay is on at checkout' : 'PromptPay is off; customers pay cash');
    } catch (err) {
      setError((err as { data?: { message?: string } })?.data?.message || 'Could not save the payment settings');
    }
  };

  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader
        title="Payments"
        description="Cash is always offered. Add a PromptPay ID to also offer a QR with the exact amount. Staff confirm each transfer in the bank app, then tap “Transfer received”."
        actions={<Badge tone={data?.promptPayId ? 'success' : 'neutral'} dot>{data?.promptPayId ? 'PromptPay on' : 'Cash only'}</Badge>}
      />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label="PromptPay ID" htmlFor="promptpay-id" hint="Mobile number or 13-digit tax ID. Leave empty to switch PromptPay off.">
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
        <Field label="Account name" htmlFor="promptpay-name" hint="The name customers will see in their bank app.">
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
        <Button onClick={submit} loading={isLoading}>Save payments</Button>
      </CardFooter>
    </Card>
  );
}
