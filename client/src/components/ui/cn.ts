/** Join class names, skipping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Lucide defaults: one stroke width everywhere, two sizes. */
export const ICON_STROKE = 1.75;
export const ICON_SM = 16;
export const ICON_MD = 20;
