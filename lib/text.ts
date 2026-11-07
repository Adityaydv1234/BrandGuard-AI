import { createHash } from 'crypto';

export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** JSON with sorted keys, so the hash survives a round trip through Postgres JSONB (which reorders keys). */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v ?? null);
}

/** Hash used to bind an approval to the exact reviewed content. */
export function contentHash(content: string, colors: unknown): string {
  return sha256(canonical({ content: content.replace(/\r\n/g, '\n'), colors: colors ?? [] }));
}

const STOP = new Set(
  'a an and are as at be by for from has have in is it its of on or our that the this to was were will with you your we us can all any into than then they their there these those not no do does did so if but about more most such only also just get'.split(
    ' '
  )
);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9₹%]+/g) || []).filter((w) => !STOP.has(w)).map(stem);
}

export interface Doc {
  id: number;
  text: string;
}

/** Okapi BM25 over a small in-memory corpus. Returns scores normalised to 0..1. */
export function bm25(query: string, docs: Doc[], k1 = 1.4, b = 0.75): Map<number, number> {
  const q = Array.from(new Set(tokenize(query)));
  const toks = docs.map((d) => tokenize(d.text));
  const N = docs.length || 1;
  const avg = toks.reduce((a, t) => a + t.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) || 0) + 1);
  const scores = new Map<number, number>();
  let max = 0;
  docs.forEach((d, i) => {
    const tf = new Map<string, number>();
    for (const w of toks[i]) tf.set(w, (tf.get(w) || 0) + 1);
    let s = 0;
    for (const w of q) {
      const f = tf.get(w) || 0;
      if (!f) continue;
      const n = df.get(w) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks[i].length) / avg));
    }
    scores.set(d.id, s);
    if (s > max) max = s;
  });
  if (max > 0) for (const [k, v] of scores) scores.set(k, v / max);
  return scores;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface RawChunk {
  ref: string;
  text: string;
}

/**
 * Split a source document into citable chunks. Recognises "§3 Heading" style sections,
 * numbered headings ("3. Settlement") and falls back to paragraphs. Page markers inserted by
 * the PDF extractor ("[[page 2]]") are carried into the reference.
 */
export function chunkSource(body: string): RawChunk[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const out: RawChunk[] = [];
  let page: number | null = null;
  let ref = '';
  let buf: string[] = [];
  let para = 0;
  const flush = () => {
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 0) {
      para++;
      const base = ref || `¶${para}`;
      const r = page ? `p.${page} ${base}` : base;
      // Long blocks are split into ~700 char windows on sentence boundaries.
      if (text.length > 900) {
        const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [text];
        let cur = '';
        let part = 1;
        for (const s of sentences) {
          if ((cur + s).length > 700 && cur) {
            out.push({ ref: `${r} (part ${part++})`, text: cur.trim() });
            cur = '';
          }
          cur += s;
        }
        if (cur.trim()) out.push({ ref: part > 1 ? `${r} (part ${part})` : r, text: cur.trim() });
      } else out.push({ ref: r, text });
    }
    buf = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    const pm = line.match(/^\[\[page (\d+)\]\]$/);
    if (pm) {
      flush();
      page = Number(pm[1]);
      ref = '';
      continue;
    }
    if (!line) {
      flush();
      ref = ref.startsWith('§') ? ref : '';
      continue;
    }
    const sec = line.match(/^(§\s?\d+(?:\.\d+)?)\s*(.*)$/) || line.match(/^(\d+(?:\.\d+)?)[.)]\s+([A-Z].{0,60})$/);
    if (sec) {
      flush();
      ref = sec[1].startsWith('§') ? sec[1].replace(/\s/, '') : `§${sec[1]}`;
      if (sec[2]) buf.push(sec[2].endsWith(':') || sec[2].endsWith('.') ? sec[2] : sec[2] + ':');
      continue;
    }
    buf.push(line);
  }
  flush();
  // Merge heading-only fragments into the following chunk with the same ref.
  const merged: RawChunk[] = [];
  for (const c of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.ref === c.ref && prev.text.length < 60) prev.text = `${prev.text} ${c.text}`;
    else merged.push({ ...c });
  }
  return merged;
}

export { diffWords, type DiffOp } from './diff';

/** Locate a quote inside content, tolerant to case and whitespace differences. */
export function locate(content: string, quote: string): { start: number; end: number } | null {
  if (!quote) return null;
  const q = quote.trim().replace(/^["'“”]+|["'“”]+$/g, '');
  if (!q) return null;
  let idx = content.indexOf(q);
  if (idx >= 0) return { start: idx, end: idx + q.length };
  idx = content.toLowerCase().indexOf(q.toLowerCase());
  if (idx >= 0) return { start: idx, end: idx + q.length };
  // Whitespace-insensitive match.
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  try {
    const m = new RegExp(esc, 'i').exec(content);
    if (m) return { start: m.index, end: m.index + m[0].length };
  } catch {
    /* ignore */
  }
  return null;
}
