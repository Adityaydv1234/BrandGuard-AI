import { query } from './db';
import { analyze } from './analysis';
import { chunkSource, contentHash, sha256 } from './text';
import { embed } from './llm';
import type { ColorPair, PolicyContext } from './types';

export type Q = (text: string, params?: unknown[]) => Promise<any[]>;
const defaultQ: Q = (t, p) => query(t, p);

export async function audit(
  q: Q,
  ws: string,
  submissionId: number | null,
  actor: string,
  action: string,
  detail: Record<string, unknown> = {}
) {
  await q('INSERT INTO audit (workspace_id, submission_id, actor_id, action, detail) VALUES ($1,$2,$3,$4,$5)', [
    ws,
    submissionId,
    actor,
    action,
    JSON.stringify(detail),
  ]);
}

/** Only APPROVED sources whose effective date has arrived are eligible as evidence. */
export async function loadPolicyContext(ws: string, q: Q = defaultQ): Promise<PolicyContext> {
  const [wsRow] = await q('SELECT palette FROM workspaces WHERE id=$1', [ws]);
  const sources = await q(
    "SELECT id, title, version, status, kind, to_char(effective_date,'YYYY-MM-DD') AS effective_date FROM sources WHERE workspace_id=$1 ORDER BY id",
    [ws]
  );
  const chunks = await q(
    `SELECT c.id, c.source_id, s.title, s.version, s.kind, c.ref, c.text, c.embedding
       FROM chunks c JOIN sources s ON s.id=c.source_id
      WHERE c.workspace_id=$1 AND s.workspace_id=$1 AND s.status='approved' AND s.effective_date <= CURRENT_DATE
      ORDER BY c.source_id, c.id`,
    [ws]
  );
  const terms = await q('SELECT * FROM terms WHERE workspace_id=$1 ORDER BY id', [ws]);
  const rules = await q('SELECT * FROM rules WHERE workspace_id=$1 ORDER BY id', [ws]);
  return {
    workspaceId: ws,
    palette: (wsRow?.palette as any[]) || [],
    sources,
    chunks: chunks.map((c: any) => ({
      ...c,
      embedding: typeof c.embedding === 'string' ? JSON.parse(c.embedding) : c.embedding,
    })),
    terms,
    // A rule pointing at a source that is not currently eligible keeps working but cites nothing.
    rules,
  };
}

export function policySnapshot(ctx: PolicyContext) {
  const eligible = new Set(ctx.chunks.map((c) => c.source_id));
  const sources = ctx.sources.filter((s) => eligible.has(s.id)).map((s) => ({ id: s.id, title: s.title, version: s.version }));
  const excluded = ctx.sources.filter((s) => !eligible.has(s.id)).map((s) => ({ id: s.id, title: s.title, version: s.version, status: s.status }));
  const fingerprint = sha256(
    JSON.stringify({
      sources,
      terms: ctx.terms.map((t) => [t.id, t.banned, t.preferred, t.severity]),
      rules: ctx.rules.filter((r) => r.active).map((r) => [r.id, r.pattern, r.severity]),
      palette: ctx.palette,
    })
  ).slice(0, 12);
  return { taken_at: new Date().toISOString(), fingerprint, sources, excluded, terms: ctx.terms.length, rules: ctx.rules.filter((r) => r.active).length };
}

export async function indexSource(sourceId: number, ws: string, body: string, q: Q = defaultQ, withEmbeddings = true) {
  await q('DELETE FROM chunks WHERE source_id=$1', [sourceId]);
  const chunks = chunkSource(body);
  const vectors = withEmbeddings ? await embed(chunks.map((c) => c.text)) : null;
  for (let i = 0; i < chunks.length; i++) {
    await q('INSERT INTO chunks (source_id, workspace_id, ref, text, embedding) VALUES ($1,$2,$3,$4,$5)', [
      sourceId,
      ws,
      chunks[i].ref,
      chunks[i].text,
      vectors ? JSON.stringify(vectors[i]) : null,
    ]);
  }
  return chunks.length;
}

/** Re-embed any chunks missing vectors (e.g. seeded before a key was configured). */
export async function backfillEmbeddings(ws: string, q: Q = defaultQ) {
  const missing = await q('SELECT id, text FROM chunks WHERE workspace_id=$1 AND embedding IS NULL ORDER BY id LIMIT 200', [ws]);
  if (!missing.length) return 0;
  const vecs = await embed(missing.map((m: any) => m.text));
  if (!vecs) return 0;
  for (let i = 0; i < missing.length; i++) await q('UPDATE chunks SET embedding=$1 WHERE id=$2', [JSON.stringify(vecs[i]), missing[i].id]);
  return missing.length;
}

export async function runAnalysisForVersion(
  versionId: number,
  ws: string,
  actor: string,
  q: Q = defaultQ,
  opts: { skipAI?: boolean } = {}
) {
  const [v] = await q('SELECT * FROM versions WHERE id=$1', [versionId]);
  if (!opts.skipAI) await backfillEmbeddings(ws, q).catch(() => 0);
  const ctx = await loadPolicyContext(ws, q);
  const colors: ColorPair[] = typeof v.colors === 'string' ? JSON.parse(v.colors) : v.colors || [];
  const { findings, meta } = await analyze(v.content, colors, ctx, opts);
  // Carry human resolutions forward: same rule + same text keeps its dismissal/dispute, on re-check of this
  // version or from the previous version, so reviewers never have to resolve the same thing twice.
  const prior = await q(
    `SELECT f.rule_key, f.span_text, f.resolution, f.resolution_note, f.resolved_by, v2.number
       FROM findings f JOIN versions v2 ON v2.id=f.version_id
      WHERE f.submission_id=$1 AND v2.number IN ($2, $3) AND f.resolution IN ('dismissed','disputed','upheld')
      ORDER BY v2.number ASC`,
    [v.submission_id, v.number, v.number - 1]
  );
  const carry = new Map<string, any>();
  for (const p of prior) carry.set(`${p.rule_key}|${(p.span_text || '').toLowerCase()}`, p);
  await q('DELETE FROM findings WHERE version_id=$1', [versionId]);
  for (const f of findings) {
    const c = carry.get(`${f.rule_key}|${(f.span_text || '').toLowerCase()}`);
    const resolution = f.verdict === 'supported' ? 'n/a' : c ? c.resolution : 'open';
    const note = c ? (c.number === v.number ? c.resolution_note : `${c.resolution_note || ''} (carried over from v${c.number})`.trim()) : null;
    await q(
      `INSERT INTO findings (version_id, submission_id, workspace_id, category, verdict, severity, span_text, span_start, span_end,
         title, rationale, suggestion, evidence, engine, rule_key, resolution, resolution_note, resolved_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        versionId,
        v.submission_id,
        ws,
        f.category,
        f.verdict,
        f.severity,
        f.span_text,
        f.span_start,
        f.span_end,
        f.title,
        f.rationale,
        f.suggestion,
        JSON.stringify(f.evidence),
        f.engine,
        f.rule_key,
        resolution,
        note,
        c ? c.resolved_by : null,
      ]
    );
  }
  const snapshot = policySnapshot(ctx);
  await q('UPDATE versions SET analysis=$1, policy_snapshot=$2 WHERE id=$3', [JSON.stringify(meta), JSON.stringify(snapshot), versionId]);
  await audit(q, ws, v.submission_id, actor, 'analysis_completed', {
    version: v.number,
    mode: meta.mode,
    findings: findings.filter((f) => f.verdict !== 'supported').length,
    supported: findings.filter((f) => f.verdict === 'supported').length,
    policy_fingerprint: snapshot.fingerprint,
  });
  return { findings, meta };
}

export async function createVersion(
  submissionId: number,
  ws: string,
  actor: string,
  content: string,
  colors: ColorPair[],
  q: Q = defaultQ
) {
  const [last] = await q('SELECT COALESCE(MAX(number),0) AS n FROM versions WHERE submission_id=$1', [submissionId]);
  const number = Number(last.n) + 1;
  const hash = contentHash(content, colors);
  const [v] = await q(
    'INSERT INTO versions (submission_id, number, content, colors, hash, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [submissionId, number, content, JSON.stringify(colors), hash, actor]
  );
  await q('UPDATE submissions SET current_version=$1, updated_at=now() WHERE id=$2', [number, submissionId]);
  await audit(q, ws, submissionId, actor, 'version_created', { version: number, hash: hash.slice(0, 12) });
  return v;
}
