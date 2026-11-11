import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/db';

export interface JwtPayload {
  userId: string;
  role: string;
  /** User.tokenVersion when the token was issued; older tokens are rejected. */
  tv?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Verify the access token AND check the account is still active and the
 * token has not been revoked. The role always comes from the database, so a
 * role change or deactivation takes effect on the very next request.
 * Returns null when the token or account is not valid.
 */
async function resolveUser(authHeader: string | undefined): Promise<JwtPayload | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  let payload: JwtPayload;
  try {
    payload = jwt.verify(authHeader.slice(7), env.jwt.accessSecret) as JwtPayload;
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, isActive: true, tokenVersion: true },
  });
  if (!user || !user.isActive || (payload.tv ?? 0) !== user.tokenVersion) return null;
  return { userId: payload.userId, role: user.role, tv: user.tokenVersion };
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }
  try {
    const user = await resolveUser(req.headers.authorization);
    if (!user) {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * For public routes that show more to logged-in staff/admins (e.g. the menu).
 * Sets req.user when a valid token is sent; otherwise continues as anonymous.
 * Never rejects the request.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await resolveUser(req.headers.authorization);
    if (user) req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
