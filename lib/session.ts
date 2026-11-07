import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { one } from './db';
import type { Role } from './types';

const COOKIE = 'bg_session';
const secret = () => process.env.SESSION_SECRET || 'dev-only-secret-change-me';

function sign(v: string) {
  return createHmac('sha256', secret()).update(v).digest('base64url');
}

export function makeToken(userId: string) {
  return `${userId}.${sign(userId)}`;
}

export function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const id = token.slice(0, i);
  const sig = Buffer.from(token.slice(i + 1));
  const want = Buffer.from(sign(id));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  return id;
}

export interface SessionUser {
  id: string;
  name: string;
  title: string;
  role: Role;
  workspace_id: string;
}

export async function currentUser(): Promise<SessionUser | null> {
  const id = readToken(cookies().get(COOKIE)?.value);
  if (!id) return null;
  return one<SessionUser>('SELECT id, name, title, role, workspace_id FROM users WHERE id=$1', [id]);
}

export function setSession(userId: string) {
  cookies().set(COOKIE, makeToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSession() {
  cookies().delete(COOKIE);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, 'Sign in to continue.');
  if (roles && !roles.includes(u.role)) throw new HttpError(403, `This action needs one of these roles: ${roles.join(', ')}.`);
  return u;
}

/** Wraps a route handler with consistent JSON errors. */
export function handler<T extends any[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e: any) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return Response.json({ error: e?.message || 'Unexpected error' }, { status });
    }
  };
}
