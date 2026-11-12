import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { readVisitKey, signVisitKey } from './visitKey';

describe('visit key', () => {
  it('round-trips the visit id', () => {
    expect(readVisitKey(signVisitKey('visit-1'))).toBe('visit-1');
  });

  it('refuses missing, broken and expired keys', () => {
    expect(readVisitKey(undefined)).toBeNull();
    expect(readVisitKey('not-a-key')).toBeNull();
    const expired = jwt.sign({ sid: 'visit-1', typ: 'visit', exp: Math.floor(Date.now() / 1000) - 10 }, `${process.env.JWT_ACCESS_SECRET}:table-visit`);
    expect(readVisitKey(expired)).toBeNull();
  });

  it('cannot be swapped with a login token, either way', () => {
    // A staff login token (signed with the access secret) is not a visit key…
    const login = jwt.sign({ userId: 'u1', role: 'STAFF', sid: 'visit-1', typ: 'visit' }, process.env.JWT_ACCESS_SECRET!);
    expect(readVisitKey(login)).toBeNull();
    // …and a visit key does not pass as a login token.
    expect(() => jwt.verify(signVisitKey('visit-1'), process.env.JWT_ACCESS_SECRET!)).toThrow();
  });
});
