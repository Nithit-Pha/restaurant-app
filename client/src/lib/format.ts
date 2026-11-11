// The restaurant is in Thailand: money is THB and times are shown in Bangkok
// time, whatever time zone the viewer's device uses.
export const CURRENCY = 'THB';
export const TIME_ZONE = 'Asia/Bangkok';

/** ฿120.00 — the same in both languages. */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: CURRENCY,
    currencyDisplay: 'narrowSymbol', // ฿120.00 rather than THB 120.00
  }).format(amount);
}

/**
 * Date and time in the page's language: "Nov 11, 2026, 03:47 PM" in English,
 * "11 พ.ย. 2569 15:47" in Thai (Thai dates use the Buddhist year, as Thai readers expect).
 */
export function formatDate(dateStr: string, locale: string = 'en'): string {
  return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: TIME_ZONE,
  }).format(new Date(dateStr));
}

// YYYY-MM-DD of a moment in Bangkok time (the restaurant's business day).
export function bangkokDateISO(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
}
