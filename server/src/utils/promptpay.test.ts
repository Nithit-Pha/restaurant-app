import { describe, expect, it } from 'vitest';
import { buildPromptPayPayload, crc16, parsePromptPayId } from './promptpay';

describe('crc16', () => {
  it('matches the standard CRC-16/CCITT-FALSE check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
});

// Expected payloads from the promptpay-qr reference tests (index.test.js).
describe('buildPromptPayPayload', () => {
  it.each([
    ['0801234567', undefined, '00020101021129370016A000000677010111011300668012345675802TH530376463046197'],
    ['080-123-4567', undefined, '00020101021129370016A000000677010111011300668012345675802TH530376463046197'],
    ['+66-89-123-4567', undefined, '00020101021129370016A000000677010111011300668912345675802TH5303764630429C1'],
    ['1111111111111', undefined, '00020101021129370016A000000677010111021311111111111115802TH530376463047B5A'],
    ['1-1111-11111-11-1', undefined, '00020101021129370016A000000677010111021311111111111115802TH530376463047B5A'],
    ['0123456789012', undefined, '00020101021129370016A000000677010111021301234567890125802TH530376463040CBD'],
    ['012345678901234', undefined, '00020101021129390016A00000067701011103150123456789012345802TH530376463049781'],
    ['000-000-0000', 4.22, '00020101021229370016A000000677010111011300660000000005802TH530376454044.226304E469'],
  ])('%s, amount %s', (id, amount, expected) => {
    expect(buildPromptPayPayload(id, amount)).toBe(expected);
  });

  it('writes the amount with two decimals', () => {
    expect(buildPromptPayPayload('0812345678', 120)).toContain('5406120.00');
  });

  it('refuses an invalid ID', () => {
    expect(() => buildPromptPayPayload('12345')).toThrow('Invalid PromptPay ID');
  });
});

describe('parsePromptPayId', () => {
  it.each([
    ['081 234 5678', 'PHONE'],
    ['+66812345678', 'PHONE'],
    ['1-2345-67890-12-3', 'TAX_ID'],
    ['012345678901234', 'EWALLET'],
  ])('%s is a %s', (raw, kind) => {
    expect(parsePromptPayId(raw)?.kind).toBe(kind);
  });

  it.each(['', 'abc', '12345', '081234567', '08123456789'])('rejects %j', (raw) => {
    expect(parsePromptPayId(raw)).toBeNull();
  });
});
