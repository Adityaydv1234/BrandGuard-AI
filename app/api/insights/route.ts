import { handler, requireUser } from '@/lib/session';
import { insights } from '@/lib/workflow';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = handler(async () => {
  const u = await requireUser();
  return Response.json(await insights(u));
});
