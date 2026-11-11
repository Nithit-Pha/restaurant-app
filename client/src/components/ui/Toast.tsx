'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn, ICON_MD, ICON_STROKE } from './cn';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** ms, default 3500 (errors 6000). */
  duration?: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** Show a short, non-blocking message: `const toast = useToast(); toast({ title: 'Saved' })`. */
export const useToast = () => useContext(ToastContext);

const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
const iconColour = { success: 'text-success', error: 'text-danger', info: 'text-info' };

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const Icon = icons[item.tone];
  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-full animate-toast-in items-start gap-3 rounded-card border border-line bg-surface p-3.5 pr-2 shadow-raised"
    >
      <Icon size={ICON_MD} strokeWidth={ICON_STROKE} className={cn('mt-px shrink-0', iconColour[item.tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{item.title}</p>
        {item.description && <p className="mt-0.5 text-sm text-fg-muted">{item.description}</p>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded-control p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
      >
        <X size={16} strokeWidth={ICON_STROKE} aria-hidden />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    ({ title, description, tone = 'success', duration }: ToastInput) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, title, description, tone }]); // at most 3 on screen
      timers.current.set(id, setTimeout(() => dismiss(id), duration ?? (tone === 'error' ? 6000 : 3500)));
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      >
        {items.map((t) => (
          <div key={t.id} className="w-full sm:w-96">
            <ToastCard item={t} onDismiss={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
