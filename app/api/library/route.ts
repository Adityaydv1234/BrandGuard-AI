import { handler, HttpError, requireUser } from '@/lib/session';
import { addRule, addSource, addTerm, deleteRule, deleteTerm, listLibrary, setPalette, setSourceStatus, toggleRule } from '@/lib/library';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = handler(async () => {
  const u = await requireUser();
  return Response.json(await listLibrary(u));
});

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const b = await req.json();
  switch (b.action) {
    case 'add_source':
      await addSource(u, b);
      break;
    case 'source_status':
      await setSourceStatus(u, Number(b.id), String(b.status));
      break;
    case 'add_term':
      await addTerm(u, b);
      break;
    case 'delete_term':
      await deleteTerm(u, Number(b.id));
      break;
    case 'add_rule':
      await addRule(u, b);
      break;
    case 'toggle_rule':
      await toggleRule(u, Number(b.id), Boolean(b.active));
      break;
    case 'delete_rule':
      await deleteRule(u, Number(b.id));
      break;
    case 'palette':
      await setPalette(u, b.palette);
      break;
    default:
      throw new HttpError(400, 'Unknown action.');
  }
  return Response.json(await listLibrary(u));
});
