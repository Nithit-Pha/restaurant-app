'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';
import IconButton from './IconButton';
import { useOverlay } from './useOverlay';

function usePortalReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons, right-aligned. Put the primary action last. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Clicking the backdrop closes the dialog (default true). Turn off for forms with unsaved input. */
  dismissOnBackdrop?: boolean;
  children?: ReactNode;
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

export function Dialog({ open, onClose, title, description, footer, size = 'md', dismissOnBackdrop = true, children }: DialogProps) {
  const ready = usePortalReady();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  // Wait for the portal: focus and the focus trap need the panel to exist.
  useOverlay(open && ready, onClose, panel);

  if (!open || !ready) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-[rgb(20_18_14/0.45)] backdrop-blur-[1px]"
        onClick={dismissOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[90vh] w-full animate-dialog-in flex-col rounded-t-dialog border border-line bg-surface shadow-raised outline-none sm:rounded-dialog',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-fg">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-fg-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mr-1 -mt-1" />
        </div>
        {children && <div className="overflow-y-auto px-5 py-3 text-sm text-fg">{children}</div>}
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 px-5 pb-5 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  side?: 'left' | 'right';
  /** Width class, default max-w-sm. */
  width?: string;
  footer?: ReactNode;
  children?: ReactNode;
  /** Hide the header row (when the content brings its own). */
  bare?: boolean;
}

export function Drawer({ open, onClose, title, side = 'right', width = 'max-w-sm', footer, children, bare }: DrawerProps) {
  const ready = usePortalReady();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Wait for the portal: focus and the focus trap need the panel to exist.
  useOverlay(open && ready, onClose, panel);

  if (!open || !ready) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-[rgb(20_18_14/0.4)]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={bare ? undefined : titleId}
        aria-label={bare && typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'absolute top-0 flex h-full w-full flex-col border-line bg-surface shadow-raised outline-none',
          width,
          side === 'right' ? 'right-0 animate-slide-in-right border-l' : 'left-0 animate-slide-in-left border-r',
        )}
      >
        {!bare && (
          <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 border-t border-line p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
