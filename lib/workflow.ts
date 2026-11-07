import { query, one } from './db';
import { audit, createVersion, runAnalysisForVersion } from './repo';
import { HttpError, type SessionUser } from './session';
import { contentHash } from './text';
import type { ColorPair, Status } from './types';
import { normHex } from './color';

export function cleanColors(input: unknown): ColorPair[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 8)
    .map((c: any) => ({
      label: String(c?.label || 'Colour pair').slice(0, 60),
      fg: normHex(String(c?.fg || '')) || '',
      bg: normHex(String(c?.bg || '')) || '',
      large: Boolean(c?.large),
    }))
    .filter((c) => c.fg && c.bg);
}

export async function getSubmission(id: number, u: SessionUser) {
  const s = await one<any>('SELECT * FROM submissions WHERE id=$1 AND workspace_id=$2', [id, u.workspace_id]);
  if (!s) throw new HttpError(404, 'Submission not found in your workspace.');
  return s;
}

const isBlocking = (f: any) =>
  f.severity === 'high' && f.verdict !== 'supported' && (f.resolution === 'open' || f.resolution === 'disputed' || f.resolution === 'upheld');

export function permissions(s: any, u: SessionUser) {
  const owner = s.creator_id === u.id || u.role === 'admin';
  const editable: Status[] = ['DRAFT', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'];
  return {
    canEdit: owner && u.role !== 'reviewer' && editable.includes(s.status),
    canSubmit: owner && u.role !== 'reviewer' && ['DRAFT', 'CHANGES_REQUESTED'].includes(s.status),
    canDecide: (u.role === 'reviewer' || u.role === 'admin') && s.status === 'UNDER_REVIEW' && s.creator_id !== u.id,
    canDispute: owner && u.role !== 'reviewer',
    canDismiss: u.role === 'reviewer' || u.role === 'admin',
    selfReviewBlocked: (u.role === 'reviewer' || u.role === 'admin') && s.creator_id === u.id,
  };
}

export async function loadDetail(id: number, u: SessionUser, versionNumber?: number) {
  const s = await getSubmission(id, u);
  const versions = await query<any>(
    'SELECT id, number, content, colors, hash, created_by, created_at, analysis, policy_snapshot FROM versions WHERE submission_id=$1 ORDER BY number',
    [id]
  );
  const current = versions.find((v) => v.number === s.current_version)!;
  const shown = versions.find((v) => v.number === versionNumber) || current;
  const findings = await query<any>(
    `SELECT f.*, u.name AS resolved_by_name FROM findings f LEFT JOIN users u ON u.id=f.resolved_by
      WHERE f.version_id=$1 ORDER BY CASE f.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, f.span_start NULLS LAST, f.id`,
    [shown.id]
  );
  const comments = await query<any>(
    'SELECT c.*, u.name, u.role FROM comments c JOIN users u ON u.id=c.user_id WHERE c.submission_id=$1 ORDER BY c.created_at',
    [id]
  );
  const decisions = await query<any>(
    'SELECT d.*, u.name AS reviewer_name FROM decisions d JOIN users u ON u.id=d.reviewer_id WHERE d.submission_id=$1 ORDER BY d.created_at',
    [id]
  );
  const auditRows = await query<any>(
    'SELECT a.*, u.name AS actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.submission_id=$1 AND a.workspace_id=$2 ORDER BY a.created_at, a.id',
    [id, u.workspace_id]
  );
  const creator = await one<any>('SELECT name, title FROM users WHERE id=$1', [s.creator_id]);

  // Integrity: an approval is only valid for the exact content hash it was given to.
  const lastApproval = [...decisions].reverse().find((d) => d.decision === 'approved');
  let integrity: any = null;
  if (lastApproval) {
    const v = versions.find((x) => x.number === lastApproval.version_number);
    const recomputed = v ? contentHash(v.content, typeof v.colors === 'string' ? JSON.parse(v.colors) : v.colors) : null;
    integrity = {
      approved_version: lastApproval.version_number,
      approved_hash: lastApproval.hash,
      stored_matches: recomputed === lastApproval.hash,
      current_version: s.current_version,
      current_hash: current.hash,
      valid: lastApproval.valid && recomputed === lastApproval.hash && current.hash === lastApproval.hash,
    };
  }
  const currentFindings = shown.id === current.id ? findings : await query<any>('SELECT * FROM findings WHERE version_id=$1', [current.id]);
  return {
    submission: { ...s, creator_name: creator?.name, creator_title: creator?.title },
    versions: versions.map((v) => ({ ...v, content: v.number === shown.number ? v.content : v.content })),
    shown: shown.number,
    findings,
    blocking: currentFindings.filter(isBlocking).length,
    comments,
    decisions,
    audit: auditRows,
    integrity,
    permissions: permissions(s, u),
  };
}

export async function createSubmission(u: SessionUser, body: any) {
  if (u.role === 'reviewer') throw new HttpError(403, 'Reviewers review content; sign in as a creator to submit drafts.');
  const title = String(body.title || '').trim().slice(0, 140);
  const channel = String(body.channel || 'Other').slice(0, 40);
  const content = String(body.content || '').replace(/\r\n/g, '\n');
  if (!title) throw new HttpError(400, 'Give the draft a title.');
  if (content.trim().length < 5) throw new HttpError(400, 'Paste or upload some content to check.');
  if (content.length > 20000) throw new HttpError(400, 'Content is over 20,000 characters. Split it into smaller pieces.');
  const [s] = await query<any>(
    "INSERT INTO submissions (workspace_id, title, channel, creator_id, status) VALUES ($1,$2,$3,$4,'DRAFT') RETURNING *",
    [u.workspace_id, title, channel, u.id]
  );
  await audit(query, u.workspace_id, s.id, u.id, 'submission_created', { title, channel, source: body.fileName || 'pasted text' });
  const v = await createVersion(s.id, u.workspace_id, u.id, content, cleanColors(body.colors));
  await runAnalysisForVersion(v.id, u.workspace_id, u.id);
  return s.id as number;
}

export async function newVersion(id: number, u: SessionUser, body: any) {
  const s = await getSubmission(id, u);
  if (!permissions(s, u).canEdit) {
    if (s.status === 'UNDER_REVIEW') throw new HttpError(409, 'This draft is locked while it is under review.');
    throw new HttpError(403, 'Only the creator can revise this draft.');
  }
  const content = String(body.content || '').replace(/\r\n/g, '\n');
  if (content.trim().length < 5) throw new HttpError(400, 'Content cannot be empty.');
  const colors = cleanColors(body.colors);
  const cur = await one<any>('SELECT hash FROM versions WHERE submission_id=$1 AND number=$2', [id, s.current_version]);
  if (cur && cur.hash === contentHash(content, colors)) throw new HttpError(400, 'Nothing changed since the last version.');
  const v = await createVersion(id, u.workspace_id, u.id, content, colors);
  if (s.status === 'APPROVED') {
    await query("UPDATE decisions SET valid=false WHERE submission_id=$1 AND decision='approved' AND valid=true", [id]);
    await audit(query, u.workspace_id, id, u.id, 'approval_invalidated', {
      reason: `Content changed after approval (v${s.current_version} to v${v.number})`,
    });
  }
  if (s.status === 'APPROVED' || s.status === 'REJECTED') await query("UPDATE submissions SET status='DRAFT' WHERE id=$1", [id]);
  await runAnalysisForVersion(v.id, u.workspace_id, u.id);
}

export async function recheck(id: number, u: SessionUser) {
  const s = await getSubmission(id, u);
  const v = await one<any>('SELECT id FROM versions WHERE submission_id=$1 AND number=$2', [id, s.current_version]);
  await runAnalysisForVersion(v.id, u.workspace_id, u.id);
}

export async function submitForReview(id: number, u: SessionUser, body: any) {
  const s = await getSubmission(id, u);
  if (!permissions(s, u).canSubmit) throw new HttpError(409, `A ${s.status.replace('_', ' ').toLowerCase()} draft cannot be submitted.`);
  await query("UPDATE submissions SET status='UNDER_REVIEW', updated_at=now() WHERE id=$1", [id]);
  const note = String(body.note || '').trim().slice(0, 1000);
  if (note) await query('INSERT INTO comments (submission_id, version_number, user_id, body) VALUES ($1,$2,$3,$4)', [id, s.current_version, u.id, note]);
  await audit(query, u.workspace_id, id, u.id, 'submitted_for_review', { version: s.current_version });
}

export async function decide(id: number, u: SessionUser, body: any) {
  const s = await getSubmission(id, u);
  const p = permissions(s, u);
  if (p.selfReviewBlocked) throw new HttpError(403, 'You cannot review your own submission.');
  if (!p.canDecide) throw new HttpError(409, 'Only drafts under review can receive a decision.');
  const decision = String(body.decision);
  if (!['approved', 'changes_requested', 'rejected'].includes(decision)) throw new HttpError(400, 'Unknown decision.');
  const reason = String(body.reason || '').trim().slice(0, 2000);
  const v = await one<any>('SELECT * FROM versions WHERE submission_id=$1 AND number=$2', [id, s.current_version]);
  const findings = await query<any>('SELECT * FROM findings WHERE version_id=$1', [v.id]);
  const blocking = findings.filter(isBlocking);
  let override = false;
  if (decision === 'approved') {
    const recomputed = contentHash(v.content, typeof v.colors === 'string' ? JSON.parse(v.colors) : v.colors);
    if (recomputed !== v.hash) throw new HttpError(409, 'Integrity check failed: stored content does not match its hash. Approval refused.');
    if (!v.analysis) throw new HttpError(409, 'This version has not been checked yet.');
    if (blocking.length) {
      if (reason.length < 15)
        throw new HttpError(
          409,
          `${blocking.length} high-severity finding${blocking.length > 1 ? 's are' : ' is'} unresolved. Dismiss them with a reason, request changes, or approve with a written override (at least 15 characters).`
        );
      override = true;
    }
  } else if (reason.length < 5) throw new HttpError(400, 'Tell the creator what to change (at least a short sentence).');
  await query(
    'INSERT INTO decisions (submission_id, version_number, hash, reviewer_id, decision, reason, override) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, s.current_version, v.hash, u.id, decision, reason || null, override]
  );
  const status = decision === 'approved' ? 'APPROVED' : decision === 'rejected' ? 'REJECTED' : 'CHANGES_REQUESTED';
  await query('UPDATE submissions SET status=$1, updated_at=now() WHERE id=$2', [status, id]);
  await audit(query, u.workspace_id, id, u.id, decision, {
    version: s.current_version,
    hash: v.hash.slice(0, 12),
    override,
    unresolved_high: blocking.length,
    reason: reason || undefined,
  });
}

export async function addComment(id: number, u: SessionUser, body: any) {
  const s = await getSubmission(id, u);
  const text = String(body.body || '').trim().slice(0, 2000);
  if (!text) throw new HttpError(400, 'Write a comment first.');
  await query('INSERT INTO comments (submission_id, version_number, user_id, body) VALUES ($1,$2,$3,$4)', [id, s.current_version, u.id, text]);
  await audit(query, u.workspace_id, id, u.id, 'commented', { version: s.current_version });
}

export async function findingAction(fid: number, u: SessionUser, body: any) {
  const f = await one<any>('SELECT * FROM findings WHERE id=$1 AND workspace_id=$2', [fid, u.workspace_id]);
  if (!f) throw new HttpError(404, 'Finding not found.');
  const s = await getSubmission(f.submission_id, u);
  const p = permissions(s, u);
  const action = String(body.action);
  const note = String(body.note || '').trim().slice(0, 1000);
  const map: Record<string, { allowed: boolean; resolution: string; needsNote: boolean }> = {
    accept: { allowed: p.canEdit, resolution: 'accepted', needsNote: false },
    dispute: { allowed: p.canDispute, resolution: 'disputed', needsNote: true },
    dismiss: { allowed: p.canDismiss, resolution: 'dismissed', needsNote: true },
    uphold: { allowed: p.canDismiss, resolution: 'upheld', needsNote: false },
    reopen: { allowed: p.canDismiss || p.canDispute, resolution: 'open', needsNote: false },
  };
  const m = map[action];
  if (!m) throw new HttpError(400, 'Unknown action.');
  if (!m.allowed) throw new HttpError(403, `Your role cannot ${action} findings on this draft right now.`);
  if (m.needsNote && note.length < 5) throw new HttpError(400, `Add a short reason to ${action} this finding.`);
  await query('UPDATE findings SET resolution=$1, resolution_note=$2, resolved_by=$3 WHERE id=$4', [
    m.resolution,
    note || null,
    m.resolution === 'open' ? null : u.id,
    fid,
  ]);
  await audit(query, u.workspace_id, f.submission_id, u.id, `finding_${m.resolution}`, {
    finding: f.title,
    rule: f.rule_key,
    severity: f.severity,
    note: note || undefined,
  });
}

export async function insights(u: SessionUser) {
  const ws = u.workspace_id;
  const byStatus = await query<any>('SELECT status, COUNT(*)::int AS n FROM submissions WHERE workspace_id=$1 GROUP BY status', [ws]);
  const firstCheck = await query<any>(
    `SELECT f.category, COUNT(*)::int AS n FROM findings f JOIN versions v ON v.id=f.version_id
      WHERE f.workspace_id=$1 AND v.number=1 AND f.verdict<>'supported' GROUP BY f.category ORDER BY n DESC`,
    [ws]
  );
  const remaining = await query<any>(
    `SELECT f.category, COUNT(*)::int AS n FROM findings f JOIN versions v ON v.id=f.version_id JOIN submissions s ON s.id=v.submission_id
      WHERE f.workspace_id=$1 AND v.number=s.current_version AND f.verdict<>'supported' AND f.resolution IN ('open','disputed','upheld')
      GROUP BY f.category ORDER BY n DESC`,
    [ws]
  );
  const recurring = await query<any>(
    `SELECT f.rule_key, MIN(f.title) AS title, MIN(f.category) AS category, COUNT(*)::int AS hits, COUNT(DISTINCT f.submission_id)::int AS submissions
       FROM findings f WHERE f.workspace_id=$1 AND f.verdict<>'supported' GROUP BY f.rule_key ORDER BY hits DESC LIMIT 8`,
    [ws]
  );
  const contested = await query<any>(
    `SELECT f.rule_key, MIN(f.title) AS title,
            SUM(CASE WHEN f.resolution='dismissed' THEN 1 ELSE 0 END)::int AS dismissed,
            SUM(CASE WHEN f.resolution='disputed' THEN 1 ELSE 0 END)::int AS disputed,
            COUNT(*)::int AS total,
            MAX(f.resolution_note) AS sample_note
       FROM findings f WHERE f.workspace_id=$1 AND f.verdict<>'supported' GROUP BY f.rule_key
      HAVING SUM(CASE WHEN f.resolution IN ('dismissed','disputed') THEN 1 ELSE 0 END) > 0
      ORDER BY SUM(CASE WHEN f.resolution IN ('dismissed','disputed') THEN 1 ELSE 0 END) DESC LIMIT 6`,
    [ws]
  );
  const decisions = await query<any>(
    `SELECT decision, COUNT(*)::int AS n, SUM(CASE WHEN override THEN 1 ELSE 0 END)::int AS overrides
       FROM decisions d JOIN submissions s ON s.id=d.submission_id WHERE s.workspace_id=$1 GROUP BY decision`,
    [ws]
  );
  const turnaround = await one<any>(
    `SELECT AVG(EXTRACT(EPOCH FROM (d.created_at - s.created_at)))/3600 AS hours FROM decisions d JOIN submissions s ON s.id=d.submission_id
      WHERE s.workspace_id=$1 AND d.decision='approved'`,
    [ws]
  );
  const engines = await query<any>(
    `SELECT engine, verdict, COUNT(*)::int AS n FROM findings WHERE workspace_id=$1 GROUP BY engine, verdict`,
    [ws]
  );
  const accepted = await one<any>(`SELECT COUNT(*)::int AS n FROM findings WHERE workspace_id=$1 AND resolution='accepted'`, [ws]);
  const invalidated = await one<any>(`SELECT COUNT(*)::int AS n FROM audit WHERE workspace_id=$1 AND action='approval_invalidated'`, [ws]);
  const injections = await one<any>(
    `SELECT COUNT(*)::int AS n FROM findings WHERE workspace_id=$1 AND category='security'`,
    [ws]
  );
  return {
    byStatus,
    firstCheck,
    remaining,
    recurring,
    contested,
    decisions,
    turnaroundHours: turnaround?.hours ? Number(turnaround.hours) : null,
    engines,
    acceptedSuggestions: accepted?.n || 0,
    invalidatedApprovals: invalidated?.n || 0,
    injectionAttempts: injections?.n || 0,
  };
}
