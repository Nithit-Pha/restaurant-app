import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

// The key a dine-in guest's browser keeps for one table visit. It is signed
// with its own secret (derived from the access-token secret), so it can never
// be used as a login token, and it only works while the visit is open.
const secret = () => `${env.jwt.accessSecret}:table-visit`;

interface VisitKeyPayload {
  sid: string; // TableSession id
  typ: 'visit';
}

export function signVisitKey(sessionId: string): string {
  return jwt.sign({ sid: sessionId, typ: 'visit' } satisfies VisitKeyPayload, secret(), { expiresIn: '16h' });
}

/** The visit id in a valid key, or null for a missing, broken, expired or foreign key. */
export function readVisitKey(key: string | undefined | null): string | null {
  if (!key) return null;
  try {
    const p = jwt.verify(key, secret()) as Partial<VisitKeyPayload>;
    return p.typ === 'visit' && typeof p.sid === 'string' ? p.sid : null;
  } catch {
    return null;
  }
}
