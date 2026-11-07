import { handler, HttpError, requireUser } from '@/lib/session';
import { extractText } from '@/lib/extract';
import { addSource, listLibrary } from '@/lib/library';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Choose a file to upload.');
  const r = await extractText(file);
  const created = await addSource(u, {
    title: String(form.get('title') || file.name.replace(/\.[^.]+$/, '')),
    kind: String(form.get('kind') || 'other'),
    version: String(form.get('version') || '1.0'),
    status: String(form.get('status') || 'draft'),
    effective_date: String(form.get('effective_date') || ''),
    body: r.text,
    file_name: file.name,
  });
  return Response.json({ ...(await listLibrary(u)), created, warnings: r.warnings });
});
