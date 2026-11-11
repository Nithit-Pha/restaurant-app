'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLoginMutation } from '../../src/api/apiSlice';
import { setCredentials } from '../../src/features/auth/authSlice';
import { useAppDispatch } from '../../src/app/hooks';
import AuthCard from '../../src/features/auth/AuthCard';
import { Alert, Button, Field, Input, fieldAria } from '../../src/components/ui';

const schema = z.object({
  username: z.string().trim().min(1, 'Username required'),
  password: z.string().min(1, 'Password required'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [login, { isLoading, error }] = useLoginMutation();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const result = await login(data).unwrap();
      dispatch(setCredentials(result));
      router.push('/');
    } catch (_) {}
  };

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Sign in to order and follow your orders."
      footer={<>No account? <Link href="/register" className="font-medium text-accent hover:underline underline-offset-2">Create one</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Username" htmlFor="login-username" error={errors.username?.message}>
          <Input
            {...register('username')}
            {...fieldAria('login-username', { error: errors.username })}
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        <Field label="Password" htmlFor="login-password" error={errors.password?.message}>
          <Input
            {...register('password')}
            {...fieldAria('login-password', { error: errors.password })}
            type="password"
            autoComplete="current-password"
          />
        </Field>
        {error && <Alert tone="danger">Invalid username or password</Alert>}
        <Button type="submit" size="lg" fullWidth loading={isLoading}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
