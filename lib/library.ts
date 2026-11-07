import { query, one } from './db';
import { audit, indexSource } from './repo';
import { HttpError, type SessionUser } from './session';
import { llmConfig } from './llm';
import { normHex } from './color';

const SEVS = ['high', 'medium', 'low'];
const KINDS = ['product', 'voice', 'visual', 'offer', 'legal', 'other'];

export async function listLibrary(u: SessionUser) {
  const ws = u.workspace_id;
  const sources = await query<any>(
    `SELECT s.id, s.title, s.kind, s.version, s.status, s.owner, to_char(s.effective_date,'YYYY-MM-DD') AS effective_date, s.file_name, s.body,
            (SELECT COUNT(*)::int FROM chunks c WHERE c.source_id=s.id) AS chunks,
            (SELECT COUNT(*)::int FROM chunks c WHERE c.source_id=s.id AND c.embedding IS NOT NULL) AS embedded,
            (s.status='approved' AND s.effective_date <= CURRENT_DATE) AS eligible
       FROM sources s WHERE s.workspace_id=$1 ORDER BY s.status='approved' DESC, s.id`,
    [ws]
  );
  const terms = await query<any>('SELECT * FROM terms WHERE workspace_id=$1 ORDER BY id', [ws]);
  const rules = await query<any>('SELECT * FROM rules WHERE workspace_id=$1 ORDER BY id', [ws]);
  const wsRow = await one<any>('SELECT name, palette FROM workspaces WHERE id=$1', [ws]);
  const cfg = llmConfig();
  return { sources, terms, rules, workspace: wsRow, ai: { provider: cfg.provider, model: cfg.model, embeddings: cfg.embeddings, endpoint: cfg.endpoint } };
}

function requireAdmin(u: SessionUser) {
  if (u.role !== 'admin') throw new HttpError(403, 'Only the workspace admin can change approved sources and rules. Switch to Meera (Admin).');
}

export async function addSource(u: SessionUser, f: { title: string; kind: string; version: string; status: string; effective_date: string; body: string; file_name?: string }) {
  requireAdmin(u);
  const title = String(f.title || '').trim().slice(0, 120);
  if (!title) throw new HttpError(400, 'Give the source a title.');
  const body = String(f.body || '').trim();
  if (body.length < 20) throw new HttpError(400, 'The source needs some text (paste it or upload a file).');
  if (body.length > 200_000) throw new HttpError(400, 'Source text is too long (200,000 characters max).');
  const kind = KINDS.includes(f.kind) ? f.kind : 'other';
  const status = ['approved', 'draft'].includes(f.status) ? f.status : 'draft';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(f.effective_date) ? f.effective_date : new Date().toISOString().slice(0, 10);
  const [s] = await query<any>(
    'INSERT INTO sources (workspace_id, title, kind, version, status, owner, effective_date, body, file_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [u.workspace_id, title, kind, String(f.version || '1.0').slice(0, 20), status, u.name, date, body, f.file_name || null]
  );
  const n = await indexSource(s.id, u.workspace_id, body);
  await audit(query, u.workspace_id, null, u.id, 'source_added', { title, status, chunks: n });
  return { id: s.id, chunks: n };
}

export async function setSourceStatus(u: SessionUser, id: number, status: string) {
  requireAdmin(u);
  if (!['approved', 'draft', 'obsolete'].includes(status)) throw new HttpError(400, 'Unknown status.');
  const s = await one<any>('SELECT title, status FROM sources WHERE id=$1 AND workspace_id=$2', [id, u.workspace_id]);
  if (!s) throw new HttpError(404, 'Source not found.');
  await query('UPDATE sources SET status=$1 WHERE id=$2', [status, id]);
  await audit(query, u.workspace_id, null, u.id, 'source_status_changed', { title: s.title, from: s.status, to: status });
}

export async function addTerm(u: SessionUser, b: any) {
  requireAdmin(u);
  const banned = String(b.banned || '').trim().slice(0, 80);
  const preferred = String(b.preferred || '').trim().slice(0, 80);
  if (!banned || !preferred) throw new HttpError(400, 'Fill in both the term to avoid and the approved term.');
  await query('INSERT INTO terms (workspace_id, banned, preferred, note, severity) VALUES ($1,$2,$3,$4,$5)', [
    u.workspace_id,
    banned,
    preferred,
    String(b.note || '').slice(0, 300),
    SEVS.includes(b.severity) ? b.severity : 'medium',
  ]);
  await audit(query, u.workspace_id, null, u.id, 'term_added', { banned, preferred });
}

export async function deleteTerm(u: SessionUser, id: number) {
  requireAdmin(u);
  await query('DELETE FROM terms WHERE id=$1 AND workspace_id=$2', [id, u.workspace_id]);
  await audit(query, u.workspace_id, null, u.id, 'term_removed', { id });
}

export async function addRule(u: SessionUser, b: any) {
  requireAdmin(u);
  const name = String(b.name || '').trim().slice(0, 80);
  const phrases = String(b.phrases || '')
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 20);
  let pattern = String(b.pattern || '').trim();
  if (!pattern && phrases.length) pattern = `\\b(?:${phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|')})\\b`;
  if (!name || !pattern) throw new HttpError(400, 'Give the rule a name and at least one phrase to catch.');
  try {
    new RegExp(pattern, 'gi');
  } catch {
    throw new HttpError(400, 'That pattern is not a valid regular expression.');
  }
  const message = String(b.message || '').trim().slice(0, 500);
  if (message.length < 10) throw new HttpError(400, 'Explain why this is a problem (shown to creators).');
  const sourceId = b.source_id ? Number(b.source_id) : null;
  if (sourceId) {
    const ok = await one('SELECT id FROM sources WHERE id=$1 AND workspace_id=$2', [sourceId, u.workspace_id]);
    if (!ok) throw new HttpError(400, 'Linked source not found.');
  }
  await query(
    'INSERT INTO rules (workspace_id, name, category, pattern, verdict, severity, message, suggestion, source_id, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [
      u.workspace_id,
      name,
      ['claim', 'tone', 'terminology', 'security', 'accessibility', 'visual'].includes(b.category) ? b.category : 'claim',
      pattern,
      b.verdict === 'contradicted' ? 'contradicted' : 'rule',
      SEVS.includes(b.severity) ? b.severity : 'medium',
      message,
      String(b.suggestion || '').trim().slice(0, 300) || null,
      sourceId,
      String(b.ref || '').trim().slice(0, 20) || null,
    ]
  );
  await audit(query, u.workspace_id, null, u.id, 'rule_added', { name });
}

export async function toggleRule(u: SessionUser, id: number, active: boolean) {
  requireAdmin(u);
  await query('UPDATE rules SET active=$1 WHERE id=$2 AND workspace_id=$3', [active, id, u.workspace_id]);
  await audit(query, u.workspace_id, null, u.id, active ? 'rule_enabled' : 'rule_disabled', { id });
}

export async function deleteRule(u: SessionUser, id: number) {
  requireAdmin(u);
  await query('DELETE FROM rules WHERE id=$1 AND workspace_id=$2', [id, u.workspace_id]);
  await audit(query, u.workspace_id, null, u.id, 'rule_removed', { id });
}

export async function setPalette(u: SessionUser, palette: any[]) {
  requireAdmin(u);
  const clean = (Array.isArray(palette) ? palette : [])
    .slice(0, 16)
    .map((p) => ({ name: String(p?.name || '').slice(0, 40), hex: normHex(String(p?.hex || '')) }))
    .filter((p) => p.name && p.hex);
  await query('UPDATE workspaces SET palette=$1 WHERE id=$2', [JSON.stringify(clean), u.workspace_id]);
  await audit(query, u.workspace_id, null, u.id, 'palette_updated', { colours: clean.length });
}
