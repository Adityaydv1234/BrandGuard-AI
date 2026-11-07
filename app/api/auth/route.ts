import { one } from '@/lib/db';
import { clearSession, handler, HttpError, setSession } from '@/lib/session';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = handler(async (req: Request) => {
  const { userId } = await req.json();
  const u = await one('SELECT id FROM users WHERE id=$1', [String(userId || '')]);
  if (!u) throw new HttpError(400, 'Unknown demo user.');
  setSession(u.id);
  return Response.json({ ok: true });
});

export const DELETE = handler(async () => {
  clearSession();
  return Response.json({ ok: true });
});
