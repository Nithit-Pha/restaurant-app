'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { isLocale } from '@/i18n/routing';
import { useLoginMutation } from '../../../src/api/apiSlice';
import { setCredentials } from '../../../src/features/auth/authSlice';
import { useAppDispatch } from '../../../src/app/hooks';
import AuthCard from '../../../src/features/auth/AuthCard';
import { Alert, Button, Field, Input, fieldAria } from '../../../src/components/ui';

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [login, { isLoading, error }] = useLoginMutation();

  const schema = useMemo(() => z.object({
    username: z.string().trim().min(1, t('usernameRequired')),
    password: z.string().min(1, t('passwordRequired')),
  }), [t]);
  type FormValues = z.infer<typeof schema>;

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const result = await login(data).unwrap();
      dispatch(setCredentials(result));
      // Continue in the language this account chose last time.
      const saved = result.user.locale;
      router.push('/', isLocale(saved) && saved !== locale ? { locale: saved } : undefined);
    } catch (_) {}
  };

  return (
    <AuthCard
      title={t('signInTitle')}
      description={t('signInDescription')}
      footer={<>{t('noAccount')} <Link href="/register" className="font-medium text-accent hover:underline underline-offset-2">{t('createOne')}</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label={t('username')} htmlFor="login-username" error={errors.username?.message}>
          <Input
            {...register('username')}
            {...fieldAria('login-username', { error: errors.username })}
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        <Field label={t('password')} htmlFor="login-password" error={errors.password?.message}>
          <Input
            {...register('password')}
            {...fieldAria('login-password', { error: errors.password })}
            type="password"
            autoComplete="current-password"
          />
        </Field>
        {error && <Alert tone="danger">{t('invalidLogin')}</Alert>}
        <Button type="submit" size="lg" fullWidth loading={isLoading}>
          {t('signIn')}
        </Button>
      </form>
    </AuthCard>
  );
}
