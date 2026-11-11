'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { apiErrorMessage } from '@/lib/localized';
import { useRegisterMutation, useSetMyLocaleMutation } from '../../../src/api/apiSlice';
import { setCredentials } from '../../../src/features/auth/authSlice';
import { useAppDispatch } from '../../../src/app/hooks';
import AuthCard from '../../../src/features/auth/AuthCard';
import { Alert, Button, Field, Input, fieldAria } from '../../../src/components/ui';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [register_, { isLoading, error }] = useRegisterMutation();
  const [saveLocale] = useSetMyLocaleMutation();

  const schema = useMemo(() => z.object({
    name: z.string().min(2, t('nameMin')),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,32}$/, t('usernameRule')),
    email: z.string().email(t('emailInvalid')),
    password: z.string().min(8, t('passwordMin')),
  }), [t]);
  type FormValues = z.infer<typeof schema>;

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const result = await register_(data).unwrap();
      dispatch(setCredentials(result));
      // New accounts start in English; keep the language they signed up in.
      if (locale !== 'en') void saveLocale(locale as 'th');
      router.push('/');
    } catch (_) {}
  };

  return (
    <AuthCard
      title={t('registerTitle')}
      description={t('registerDescription')}
      footer={<>{t('haveAccount')} <Link href="/login" className="font-medium text-accent hover:underline underline-offset-2">{t('signIn')}</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label={t('name')} htmlFor="reg-name" required error={errors.name?.message}>
          <Input {...register('name')} {...fieldAria('reg-name', { error: errors.name, required: true })} autoComplete="name" />
        </Field>
        <Field
          label={t('username')}
          htmlFor="reg-username"
          required
          error={errors.username?.message}
          hint={t('usernameHint')}
        >
          <Input
            {...register('username')}
            {...fieldAria('reg-username', { error: errors.username, hint: true, required: true })}
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        <Field label={t('email')} htmlFor="reg-email" required error={errors.email?.message}>
          <Input {...register('email')} {...fieldAria('reg-email', { error: errors.email, required: true })} type="email" autoComplete="email" />
        </Field>
        <Field label={t('password')} htmlFor="reg-password" required error={errors.password?.message} hint={t('passwordHint')}>
          <Input
            {...register('password')}
            {...fieldAria('reg-password', { error: errors.password, hint: true, required: true })}
            type="password"
            autoComplete="new-password"
          />
        </Field>
        {error && (
          <Alert tone="danger">
            {apiErrorMessage(error, locale, 'status' in error && error.status === 409 ? t('accountExists') : t('registerFailed'))}
          </Alert>
        )}
        <Button type="submit" size="lg" fullWidth loading={isLoading}>
          {t('register')}
        </Button>
      </form>
    </AuthCard>
  );
}
