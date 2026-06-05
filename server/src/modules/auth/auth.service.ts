import bcrypt from 'bcrypt';
import { prisma } from '../../config/db';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';

export async function register(name: string, email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw Object.assign(new Error('Email already registered'), { statusCode: 409 });

  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, password: hash },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  const payload = { userId: user.id, role: user.role };
  return {
    user,
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

  const payload = { userId: user.id, role: user.role };
  const { password: _, ...safeUser } = user;
  return {
    user: safeUser,
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export async function refresh(token: string) {
  const payload = verifyRefreshToken(token);
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 401 });

  const newPayload = { userId: user.id, role: user.role };
  return {
    accessToken: signAccessToken(newPayload),
    refreshToken: signRefreshToken(newPayload),
  };
}

export async function getMe(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, phone: true, address: true, createdAt: true },
  });
}
