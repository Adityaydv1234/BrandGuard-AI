import { handler, HttpError, requireUser } from '@/lib/session';
import { addComment, decide, loadDetail, newVersion, recheck, submitForReview } from '@/lib/workflow';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const u = await requireUser();
  const v = new URL(req.url).searchParams.get('v');
  return Response.json(await loadDetail(Number(params.id), u, v ? Number(v) : undefined));
});

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const u = await requireUser();
  const id = Number(params.id);
  const body = await req.json();
  switch (body.action) {
    case 'new_version':
      await newVersion(id, u, body);
      break;
    case 'recheck':
      await recheck(id, u);
      break;
    case 'submit':
      await submitForReview(id, u, body);
      break;
    case 'decide':
      await decide(id, u, body);
      break;
    case 'comment':
      await addComment(id, u, body);
      break;
    default:
      throw new HttpError(400, 'Unknown action.');
  }
  return Response.json(await loadDetail(id, u));
});
