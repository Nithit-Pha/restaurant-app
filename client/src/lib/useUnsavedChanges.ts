'use client';

import { useEffect, useId } from 'react';

// Pages with unsaved input register here, so the language switch can ask
// first: the language is part of the URL (/en, /th), so switching rebuilds
// the page and anything not saved is lost.
const unsaved = new Set<string>();

function warnOnUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = '';
}

/** True while any page or form on screen reports unsaved changes. */
export function hasUnsavedChanges(): boolean {
  return unsaved.size > 0;
}

/**
 * Report unsaved changes while `dirty` is true. The browser also warns before
 * the tab is closed or reloaded.
 */
export function useUnsavedChanges(dirty: boolean) {
  const id = useId();
  useEffect(() => {
    if (!dirty) return;
    unsaved.add(id);
    window.addEventListener('beforeunload', warnOnUnload);
    return () => {
      unsaved.delete(id);
      if (unsaved.size === 0) window.removeEventListener('beforeunload', warnOnUnload);
    };
  }, [dirty, id]);
}
