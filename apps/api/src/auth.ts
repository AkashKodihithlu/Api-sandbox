import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyRequest } from 'fastify';

const scrypt = promisify(scryptCallback);

export type AuthenticatedUser = { id: string; email: string };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, hash] = encoded.split(':');
  if (!salt || !hash) return false;
  const candidate = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

export async function requireUser(request: FastifyRequest): Promise<AuthenticatedUser> {
  await request.jwtVerify();
  return request.user as AuthenticatedUser;
}
