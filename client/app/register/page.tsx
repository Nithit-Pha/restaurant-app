'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRegisterMutation } from '../../src/api/apiSlice';
import { setCredentials } from '../../src/features/auth/authSlice';
import { useAppDispatch } from '../../src/app/hooks';
import AuthCard from '../../src/features/auth/AuthCard';
import { Alert, Button, Field, Input, fieldAria } from '../../src/components/ui';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, 'Username must be 3-32 characters: letters, numbers, dot, underscore or dash'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [register_, { isLoading, error }] = useRegisterMutation();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const result = await register_(data).unwrap();
      dispatch(setCredentials(result));
      router.push('/');
    } catch (_) {}
  };

  return (
    <AuthCard
      title="Create account"
      description="Order online and follow every order as the kitchen works on it."
      footer={<>Already have an account? <Link href="/login" className="font-medium text-accent hover:underline underline-offset-2">Sign in</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="reg-name" required error={errors.name?.message}>
          <Input {...register('name')} {...fieldAria('reg-name', { error: errors.name, required: true })} autoComplete="name" />
        </Field>
        <Field
          label="Username"
          htmlFor="reg-username"
          required
          error={errors.username?.message}
          hint="Letters, numbers, dot, underscore or dash. You sign in with this."
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
        <Field label="Email" htmlFor="reg-email" required error={errors.email?.message}>
          <Input {...register('email')} {...fieldAria('reg-email', { error: errors.email, required: true })} type="email" autoComplete="email" />
        </Field>
        <Field label="Password" htmlFor="reg-password" required error={errors.password?.message} hint="At least 8 characters.">
          <Input
            {...register('password')}
            {...fieldAria('reg-password', { error: errors.password, hint: true, required: true })}
            type="password"
            autoComplete="new-password"
          />
        </Field>
        {error && (
          <Alert tone="danger">
            {(error as { data?: { message?: string } }).data?.message || 'Registration failed. Try again.'}
          </Alert>
        )}
        <Button type="submit" size="lg" fullWidth loading={isLoading}>
          Register
        </Button>
      </form>
    </AuthCard>
  );
}
