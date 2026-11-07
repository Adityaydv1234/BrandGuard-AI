import { handler, HttpError, requireUser } from '@/lib/session';
import { extractText, stripPageMarkers } from '@/lib/extract';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = handler(async (req: Request) => {
  await requireUser();
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Choose a file to upload.');
  const r = await extractText(file);
  return Response.json({ text: stripPageMarkers(r.text), pages: r.pages, warnings: r.warnings, fileName: file.name });
});
