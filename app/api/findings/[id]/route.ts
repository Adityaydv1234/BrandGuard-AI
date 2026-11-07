import { handler, requireUser } from '@/lib/session';
import { findingAction } from '@/lib/workflow';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const u = await requireUser();
  await findingAction(Number(params.id), u, await req.json());
  return Response.json({ ok: true });
});
