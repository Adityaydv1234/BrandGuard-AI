// Text extraction for uploaded files. Content that cannot be read is reported, never silently skipped.
import { HttpError } from './session';

export const MAX_UPLOAD = 5 * 1024 * 1024;

export async function extractText(file: File): Promise<{ text: string; pages: number | null; warnings: string[] }> {
  if (file.size > MAX_UPLOAD) throw new HttpError(413, 'File is larger than 5 MB.');
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  const warnings: string[] = [];
  let text = '';
  let pages: number | null = null;
  if (name.endsWith('.pdf')) {
    const { getDocumentProxy, extractText: pdfText } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const r = await pdfText(pdf, { mergePages: false });
    const arr = Array.isArray(r.text) ? r.text : [r.text];
    pages = r.totalPages;
    text = arr.map((t: string, i: number) => `[[page ${i + 1}]]\n${t.trim()}`).join('\n\n');
    const empty = arr.filter((t: string) => t.trim().length < 20).length;
    if (empty) warnings.push(`${empty} of ${pages} page(s) had little or no extractable text (possibly scanned). Those pages were not evaluated.`);
  } else if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ buffer: buf });
    text = r.value;
  } else if (/\.(txt|md|markdown|html?|csv)$/.test(name)) {
    text = buf.toString('utf8');
    if (/\.html?$/.test(name)) text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<(?!img)[^>]+>/g, ' ');
  } else {
    throw new HttpError(415, 'Unsupported file type. Upload PDF, DOCX, TXT, MD or HTML. Images arrive in Round 3.');
  }
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.replace(/\[\[page \d+\]\]/g, '').trim().length < 20) warnings.push('Almost no text could be extracted. This file was only partially evaluated.');
  return { text, pages, warnings };
}

/** For drafts we strip the page markers; for sources we keep them for citations. */
export function stripPageMarkers(text: string) {
  return text.replace(/\[\[page \d+\]\]\n?/g, '').trim();
}
