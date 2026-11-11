import type { ReactNode } from 'react';

/** Centered card used by the sign-in and register pages. */
export default function AuthCard({ title, description, footer, children }: {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10 lg:min-h-screen">
      <div className="w-full max-w-sm">
        <div className="rounded-dialog border border-line bg-surface p-6 shadow-soft sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mt-1 text-sm text-fg-muted">{description}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-5 text-center text-sm text-fg-muted">{footer}</p>
      </div>
    </div>
  );
}
