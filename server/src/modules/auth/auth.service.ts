import bcrypt from 'bcrypt';
import { prisma } from '../../config/db';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { audit } from '../../utils/auditLog';

export async function register(name: string, username: string, email: string, password: string) {
  if (await prisma.user.findUnique({ where: { username } })) {
    throw Object.assign(new Error('Username already taken'), { statusCode: 409 });
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 409 });
  }

  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, username, email, password: hash },
    select: { id: true, name: true, username: true, email: true, role: true, createdAt: true },
  });

  const payload = { userId: user.id, role: user.role, tv: 0 };
  return {
    user,
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
  if (!user.isActive) {
    throw Object.assign(new Error('This account has been deactivated. Please contact the restaurant owner.'), { statusCode: 403 });
  }

  const payload = { userId: user.id, role: user.role, tv: user.tokenVersion };
  const { password: _, tokenVersion: __, ...safeUser } = user;
  audit({ actorId: user.id, action: 'LOGIN', entityType: 'USER', entityId: user.id });
  return {
    user: safeUser,
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export async function refresh(token: string) {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  // Deactivated accounts and revoked tokens (old tokenVersion) cannot refresh.
  if (!user || !user.isActive || (payload.tv ?? 0) !== user.tokenVersion) {
    throw Object.assign(new Error('Session expired. Please sign in again.'), { statusCode: 401 });
  }

  const newPayload = { userId: user.id, role: user.role, tv: user.tokenVersion };
  return {
    accessToken: signAccessToken(newPayload),
    refreshToken: signRefreshToken(newPayload),
  };
}

export async function getMe(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true, email: true, role: true, phone: true, address: true, locale: true, createdAt: true },
  });
}

/** Remember the website language the user chose ("en" or "th"; checked by the route). */
export async function setLocale(userId: string, locale: string) {
  await prisma.user.update({ where: { id: userId }, data: { locale } });
}
