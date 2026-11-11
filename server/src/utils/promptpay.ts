// PromptPay QR payload (EMVCo merchant-presented QR, Thai PromptPay profile).
// Pure, so it is unit-tested against known payloads. Field layout follows the
// promptpay-qr reference implementation (github.com/dtinth/promptpay-qr):
//   00 payload format · 01 static/dynamic · 29 PromptPay account
//   58 country · 53 currency (764 = THB) · 54 amount · 63 CRC-16

const PROMPTPAY_GUID = 'A000000677010111';

/** Tag + 2-digit length + value. */
const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as 4 upper-case hex digits. */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export type PromptPayIdKind = 'PHONE' | 'TAX_ID' | 'EWALLET';

/**
 * Check a PromptPay ID: a Thai mobile number (0812345678 or +66812345678),
 * a 13-digit national / tax ID, or a 15-digit e-wallet ID. Spaces and dashes
 * are ignored. Returns the digits and the kind, or null when it is not valid.
 */
export function parsePromptPayId(raw: string): { digits: string; kind: PromptPayIdKind } | null {
  const digits = raw.replace(/[\s-]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 15) return { digits, kind: 'EWALLET' };
  if (digits.length === 13) return { digits, kind: 'TAX_ID' };
  if (/^0\d{9}$/.test(digits) || /^66\d{9}$/.test(digits)) return { digits, kind: 'PHONE' };
  return null;
}

/**
 * The text to put in the QR code. With an amount the banking app fills it in
 * (a "dynamic" QR); without one the customer types it.
 */
export function buildPromptPayPayload(promptPayId: string, amount?: number): string {
  const id = parsePromptPayId(promptPayId);
  if (!id) throw new Error('Invalid PromptPay ID');

  const account =
    id.kind === 'EWALLET'
      ? field('03', id.digits)
      : id.kind === 'TAX_ID'
        ? field('02', id.digits)
        // Phone: country code 66 instead of the leading 0, padded to 13 digits.
        : field('01', id.digits.replace(/^0/, '66').padStart(13, '0'));

  const hasAmount = amount !== undefined && amount > 0;
  const data = [
    field('00', '01'),
    field('01', hasAmount ? '12' : '11'),
    field('29', field('00', PROMPTPAY_GUID) + account),
    field('58', 'TH'),
    field('53', '764'),
    hasAmount ? field('54', amount!.toFixed(2)) : '',
  ].join('');
  const withCrcTag = `${data}6304`;
  return withCrcTag + crc16(withCrcTag);
}
