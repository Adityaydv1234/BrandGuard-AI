'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ColorPairs, { ColorSwatches, type Pair } from '@/components/ColorPairs';
import { applyColorFix, applyTextFix, FindingCard, ProofView, type Finding } from '@/components/Review';
import { api, ErrorNote, fmtTime, ROLE_LABEL, StatusPill, useMe } from '@/components/ui';
import { diffWords } from '@/lib/diff';

interface Version {
  id: number;
  number: number;
  content: string;
  colors: Pair[];
  hash: string;
  created_by: string;
  created_at: string;
  analysis: any;
  policy_snapshot: any;
}
interface Detail {
  submission: any;
  versions: Version[];
  shown: number;
  findings: Finding[];
  blocking: number;
  comments: any[];
  decisions: any[];
  audit: any[];
  integrity: any;
  permissions: { canEdit: boolean; canSubmit: boolean; canDecide: boolean; canDispute: boolean; canDismiss: boolean; selfReviewBlocked: boolean };
}

const ACTION_LABEL: Record<string, string> = {
  submission_created: 'Created the draft',
  version_created: 'Saved a version',
  analysis_completed: 'Check completed',
  submitted_for_review: 'Submitted for review',
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Requested changes',
  approval_invalidated: 'Approval cancelled',
  commented: 'Commented',
  finding_disputed: 'Disputed a finding',
  finding_dismissed: 'Dismissed a finding',
  finding_upheld: 'Upheld a finding',
  finding_accepted: 'Applied a suggested fix',
  finding_open: 'Reopened a finding',
};

export default function ReviewPage({ params }: { params: { id: string } }) {
  const { me } = useMe();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftColors, setDraftColors] = useState<Pair[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'discussion' | 'history' | 'audit' | 'policy'>('discussion');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [showSupported, setShowSupported] = useState(false);

  const load = useCallback(
    async (v?: number) => {
      try {
        setD(await api<Detail>(`/api/submissions/${params.id}${v ? `?v=${v}` : ''}`));
        setError(null);
      } catch (e: any) {
        setError(e.message);
      }
    },
    [params.id]
  );
  useEffect(() => {
    load();
  }, [load]);

  const shownVersion = d?.versions.find((v) => v.number === d.shown);
  const isCurrent = d ? d.shown === d.submission.current_version : false;
  const attention = useMemo(() => (d?.findings || []).filter((f) => f.verdict !== 'supported'), [d]);
  const supported = useMemo(() => (d?.findings || []).filter((f) => f.verdict === 'supported'), [d]);
  const numbers = useMemo(() => new Map([...attention, ...supported].map((f, i) => [f.id, i + 1])), [attention, supported]);

  if (error && !d) return <ErrorNote error={error} />;
  if (!d || !shownVersion) return <p className="muted">Loading draft…</p>;

  const s = d.submission;
  const p = d.permissions;
  const colors: Pair[] = typeof shownVersion.colors === 'string' ? JSON.parse(shownVersion.colors as any) : shownVersion.colors || [];
  const meta = shownVersion.analysis;
  const openHigh = d.blocking;

  const act = async (label: string, body: any) => {
    setBusy(label);
    setError(null);
    try {
      const r = await api<Detail>(`/api/submissions/${params.id}`, { method: 'POST', json: body });
      setD(r);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const startEdit = () => {
    setDraft(shownVersion.content);
    setDraftColors(colors.map((c) => ({ ...c })));
    setEditing(true);
  };

  const pick = (id: number) => {
    setActive(id);
    document.getElementById(`finding-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const markAccepted = (f: Finding) => {
    setD((cur) => (cur ? { ...cur, findings: cur.findings.map((x) => (x.id === f.id ? { ...x, resolution: 'accepted', resolved_by_name: me?.user?.name || null } : x)) } : cur));
    api(`/api/findings/${f.id}`, { method: 'POST', json: { action: 'accept' } }).catch(() => null);
  };

  const applyOne = (f: Finding) => {
    const baseText = editing ? draft : shownVersion.content;
    const baseColors = editing ? draftColors : colors.map((c) => ({ ...c }));
    if (!editing) {
      setDraft(baseText);
      setDraftColors(baseColors);
      setEditing(true);
    }
    if (f.span_text) {
      const next = applyTextFix(baseText, shownVersion.content, f);
      if (next == null) return setError('That text has already been changed in your edit, so the fix was not applied.');
      setDraft(next);
    } else {
      const next = applyColorFix(baseColors, f);
      if (!next) return setError('This suggestion needs a manual change.');
      setDraftColors(next);
    }
    setError(null);
    markAccepted(f);
  };

  const applyAll = () => {
    const fixable = attention.filter((f) => f.suggestion && f.resolution === 'open');
    let text = editing ? draft : shownVersion.content;
    let cols = editing ? draftColors : colors.map((c) => ({ ...c }));
    const textFixes = fixable.filter((f) => f.span_text && f.span_start != null).sort((a, b) => b.span_start! - a.span_start!);
    const original = text === shownVersion.content;
    let used = 0;
    let lastStart = Infinity;
    for (const f of textFixes) {
      if (original && f.span_end! > lastStart) continue; // overlapping fix, skip
      const next = original
        ? text.slice(0, f.span_start!) + f.suggestion + text.slice(f.span_end!)
        : applyTextFix(text, shownVersion.content, f);
      if (next != null) {
        text = next;
        lastStart = f.span_start!;
        used++;
        markAccepted(f);
      }
    }
    for (const f of fixable.filter((x) => !x.span_text)) {
      const next = applyColorFix(cols, f);
      if (next) {
        cols = next;
        used++;
        markAccepted(f);
      }
    }
    setDraft(text);
    setDraftColors(cols);
    setEditing(true);
    setError(used ? null : 'No automatic fixes were available.');
  };

  const findingAction = async (f: Finding, action: string, note?: string) => {
    try {
      await api(`/api/findings/${f.id}`, { method: 'POST', json: { action, note } });
      await load(d.shown);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const saveVersion = async () => {
    const ok = await act('save', { action: 'new_version', content: draft, colors: draftColors });
    if (ok) {
      setEditing(false);
      setShowSupported(false);
    }
  };

  const decide = async (decision: string) => {
    if (await act(decision, { action: 'decide', decision, reason })) setReason('');
  };

  const fixableCount = attention.filter((f) => f.suggestion && f.resolution === 'open').length;
  const lastApproval = [...d.decisions].reverse().find((x) => x.decision === 'approved');
  const prev = d.versions.find((v) => v.number === d.shown - 1);

  return (
    <div className="space-y-6">
      {/* Title and status */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="btn-link text-graphite">
            Back to {me?.user?.role === 'reviewer' ? 'queue' : 'drafts'}
          </Link>
          <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight">{s.title}</h1>
          <p className="mt-1 muted">
            {s.channel}, by {s.creator_name} ({s.creator_title})
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusPill status={s.status} />
          <div className="flex flex-wrap justify-end gap-1" role="group" aria-label="Versions">
            {d.versions.map((v) => (
              <button
                key={v.number}
                onClick={() => {
                  setEditing(false);
                  load(v.number);
                }}
                className={`rounded px-2 py-0.5 text-xs font-semibold ${v.number === d.shown ? 'bg-ink text-white' : 'bg-white text-graphite ring-1 ring-rule hover:ring-ink'}`}
                aria-pressed={v.number === d.shown}
              >
                v{v.number}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Approval record */}
      {d.integrity && (
        <div className={`inline-block rounded-md px-4 py-3 ${d.integrity.valid ? 'stamp' : 'stamp stamp-void'}`}>
          {d.integrity.valid ? (
            <>
              <p className="font-serif text-lg font-semibold">Approved: version {d.integrity.approved_version}</p>
              <p className="text-sm">
                by {lastApproval?.reviewer_name}, {fmtTime(lastApproval?.created_at)}. Content fingerprint {d.integrity.approved_hash.slice(0, 12)} verified.
                {lastApproval?.override && ' Approved with a written override.'}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">The approval of version {d.integrity.approved_version} no longer applies</p>
              <p className="text-sm">
                {d.integrity.current_version !== d.integrity.approved_version
                  ? `Content changed in version ${d.integrity.current_version} (fingerprint ${d.integrity.current_hash.slice(0, 12)}), so it needs a new review.`
                  : 'Stored content no longer matches the approved fingerprint.'}
              </p>
            </>
          )}
        </div>
      )}

      {!isCurrent && (
        <p className="rounded-md border border-rule bg-white px-4 py-2 text-sm">
          You are viewing version {d.shown}, an earlier version.{' '}
          <button className="btn-link" onClick={() => load()}>
            Go to the current version ({s.current_version})
          </button>
        </p>
      )}

      <ErrorNote error={error} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* The proof */}
        <section aria-label="Draft content" className="space-y-4">
          <div className="panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3 text-sm">
              <div className="muted">
                {meta ? (
                  <>
                    Version {d.shown} checked{' '}
                    {meta.mode === 'full'
                      ? `with rules and AI claim verification (${meta.model}, ${meta.retrieval} retrieval, ${meta.claims_checked} claims)`
                      : 'with rules only'}
                    {` in ${(meta.duration_ms / 1000).toFixed(1)}s`}
                  </>
                ) : (
                  'Not checked yet'
                )}
              </div>
              {isCurrent && !editing && (
                <button className="btn-link" disabled={!!busy} onClick={() => act('recheck', { action: 'recheck' })}>
                  {busy === 'recheck' ? 'Checking…' : meta?.mode === 'full' ? 'Re-run check' : 'Run full check'}
                </button>
              )}
            </div>
            {meta?.warnings?.length > 0 && (
              <div className="border-b border-rule bg-[#FBF4E6] px-5 py-2 text-sm text-mark-med">
                {meta.warnings.map((w: string) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}
            <div className="px-5 py-6 sm:px-8">
              {editing ? (
                <div className="space-y-4">
                  {s.status === 'APPROVED' && (
                    <p className="rounded-md bg-[#FBF4E6] px-3 py-2 text-sm text-mark-med">
                      This draft is approved. Saving a new version cancels that approval and sends it back to draft.
                    </p>
                  )}
                  <label className="label" htmlFor="editor">
                    Edit the draft
                  </label>
                  <textarea
                    id="editor"
                    className="field min-h-[280px] font-serif text-[17px] leading-relaxed"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <details open={draftColors.length > 0}>
                    <summary className="cursor-pointer text-sm font-medium">Design colours</summary>
                    <div className="mt-3">
                      <ColorPairs pairs={draftColors} onChange={setDraftColors} />
                    </div>
                  </details>
                  {draft !== shownVersion.content && (
                    <div className="rounded-md border border-rule bg-[#F8F9FB] p-3 text-sm">
                      <p className="mb-1 font-medium">Your changes</p>
                      <Diff a={shownVersion.content} b={draft} />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button className="btn-primary" disabled={!!busy} onClick={saveVersion}>
                      {busy === 'save' ? 'Saving and re-checking…' : `Save as version ${s.current_version + 1} and re-check`}
                    </button>
                    <button className="btn-ghost" disabled={!!busy} onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <ProofView content={shownVersion.content} findings={d.findings} numbers={numbers} active={active} onPick={pick} />
              )}
            </div>
            {!editing && colors.length > 0 && (
              <div className="border-t border-rule px-5 py-4">
                <p className="mb-2 text-sm font-medium">Design colours</p>
                <ColorSwatches pairs={colors} />
              </div>
            )}
          </div>

          {/* Creator actions */}
          {isCurrent && !editing && (p.canEdit || p.canSubmit) && (
            <div className="panel space-y-3 p-5">
              <h2 className="font-semibold">Your next step</h2>
              {p.canSubmit && openHigh > 0 && (
                <p className="text-sm text-mark-high">
                  {openHigh} high-severity finding{openHigh > 1 ? 's are' : ' is'} still open. Fix or dispute {openHigh > 1 ? 'them' : 'it'} before submitting, or the reviewer will have to.
                </p>
              )}
              {s.status === 'CHANGES_REQUESTED' && (
                <p className="text-sm">The reviewer asked for changes. Read their note under Discussion, revise, then submit again.</p>
              )}
              <div className="flex flex-wrap gap-3">
                {p.canEdit && fixableCount > 0 && (
                  <button className="btn-primary" onClick={applyAll}>
                    Apply all {fixableCount} suggested fixes
                  </button>
                )}
                {p.canEdit && (
                  <button className="btn-ghost" onClick={startEdit}>
                    Edit draft
                  </button>
                )}
                {p.canSubmit && (
                  <button className="btn-approve" disabled={!!busy} onClick={() => act('submit', { action: 'submit' })}>
                    {busy === 'submit' ? 'Submitting…' : 'Submit for review'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Reviewer decision */}
          {isCurrent && p.canDecide && (
            <div className="panel space-y-3 p-5">
              <h2 className="font-semibold">Your decision on version {s.current_version}</h2>
              {openHigh > 0 ? (
                <p className="text-sm text-mark-high">
                  {openHigh} high-severity finding{openHigh > 1 ? 's are' : ' is'} unresolved. Dismiss with a reason, request changes, or approve with a written
                  override of at least 15 characters. Overrides are recorded.
                </p>
              ) : (
                <p className="text-sm muted">No unresolved high-severity findings. Your approval will be tied to this exact version.</p>
              )}
              <label className="label" htmlFor="reason">
                Note to the creator {openHigh > 0 ? '(required for an override)' : '(required for changes or rejection)'}
              </label>
              <textarea id="reason" className="field min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex flex-wrap gap-3">
                <button className="btn-approve" disabled={!!busy} onClick={() => decide('approved')}>
                  {busy === 'approved' ? 'Approving…' : openHigh > 0 ? 'Approve with override' : 'Approve'}
                </button>
                <button className="btn-ghost" disabled={!!busy} onClick={() => decide('changes_requested')}>
                  Request changes
                </button>
                <button className="btn-danger" disabled={!!busy} onClick={() => decide('rejected')}>
                  Reject
                </button>
              </div>
            </div>
          )}
          {p.selfReviewBlocked && s.status === 'UNDER_REVIEW' && (
            <p className="text-sm muted">You created this draft, so someone else has to review it.</p>
          )}
          {!p.canDecide && !p.selfReviewBlocked && me?.user?.role !== 'creator' && s.status !== 'UNDER_REVIEW' && isCurrent && (
            <p className="text-sm muted">Decisions open once the creator submits this draft for review.</p>
          )}
          {me?.user?.role === 'creator' && s.status === 'UNDER_REVIEW' && (
            <p className="text-sm muted">This draft is locked while it is in review. Switch to Arjun (reviewer) in the top bar to decide on it.</p>
          )}
        </section>

        {/* Findings */}
        <section aria-label="Findings" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">
              {attention.length ? `${attention.length} finding${attention.length > 1 ? 's' : ''} to look at` : meta?.mode === 'full' ? 'Nothing to fix' : 'No rule findings'}
            </h2>
            {supported.length > 0 && <span className="text-sm text-mark-ok">{supported.length} claims supported</span>}
          </div>
          {attention.length === 0 && (
            <p className="rounded-lg border border-rule bg-sheet p-4 text-sm">
              {meta?.mode === 'full'
                ? 'No guideline problems were found, and every claim the AI extracted is backed by an approved source.'
                : 'The rule checks found nothing. Factual claims that no rule covers were not verified, because AI claim checking was not run on this version.'}
            </p>
          )}
          <div className="space-y-3 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:pr-1">
            {attention.map((f) => (
              <FindingCard
                key={f.id}
                f={f}
                n={numbers.get(f.id)!}
                active={active === f.id}
                canAct={isCurrent}
                perms={p}
                onApply={applyOne}
                onAction={findingAction}
                onPick={pick}
              />
            ))}
            {supported.length > 0 && (
              <div>
                <button className="btn-link" onClick={() => setShowSupported(!showSupported)} aria-expanded={showSupported}>
                  {showSupported ? 'Hide' : 'Show'} {supported.length} supported claim{supported.length > 1 ? 's' : ''} and their evidence
                </button>
                {showSupported && (
                  <div className="mt-3 space-y-3">
                    {supported.map((f) => (
                      <FindingCard
                        key={f.id}
                        f={f}
                        n={numbers.get(f.id)!}
                        active={active === f.id}
                        canAct={false}
                        perms={p}
                        onApply={applyOne}
                        onAction={findingAction}
                        onPick={pick}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Lower tabs */}
      <section className="panel p-5">
        <div className="flex flex-wrap gap-6 border-b border-rule" role="tablist">
          {(
            [
              ['discussion', `Discussion (${d.comments.length + d.decisions.length})`],
              ['history', `Version history (${d.versions.length})`],
              ['audit', 'Audit trail'],
              ['policy', 'Sources used'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'tab-active' : ''}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'discussion' && (
          <div className="mt-4 space-y-4">
            {[...d.comments.map((c) => ({ ...c, kind: 'comment' })), ...d.decisions.map((x) => ({ ...x, kind: 'decision' }))]
              .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
              .map((x) => (
                <div key={`${x.kind}-${x.id}`} className="border-l-2 border-rule pl-4">
                  <p className="text-sm">
                    <span className="font-semibold">{x.kind === 'comment' ? x.name : x.reviewer_name}</span>
                    <span className="text-graphite">
                      {x.kind === 'comment' ? ` (${ROLE_LABEL[x.role]}) on v${x.version_number}` : ` ${x.decision.replace('_', ' ')} v${x.version_number}`}
                      {x.override ? ' with override' : ''}
                      {x.kind === 'decision' && x.decision === 'approved' && !x.valid ? ' (no longer valid)' : ''}, {fmtTime(x.created_at)}
                    </span>
                  </p>
                  {(x.body || x.reason) && <p className="mt-1 text-sm">{x.body || x.reason}</p>}
                </div>
              ))}
            {d.comments.length + d.decisions.length === 0 && <p className="text-sm muted">No comments yet.</p>}
            <div className="space-y-2">
              <label htmlFor="comment" className="label">
                Add a comment
              </label>
              <textarea id="comment" className="field min-h-[70px]" value={comment} onChange={(e) => setComment(e.target.value)} />
              <button
                className="btn-ghost"
                disabled={!comment.trim() || !!busy}
                onClick={async () => (await act('comment', { action: 'comment', body: comment })) && setComment('')}
              >
                Post comment
              </button>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="mt-4 space-y-4">
            {[...d.versions].reverse().map((v) => (
              <div key={v.number} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2 text-sm last:border-0">
                <span>
                  <button className="btn-link" onClick={() => load(v.number)}>
                    Version {v.number}
                  </button>
                  <span className="text-graphite">, {fmtTime(v.created_at)}, fingerprint {v.hash.slice(0, 12)}</span>
                </span>
                <span className="text-graphite">
                  {v.analysis ? (v.analysis.mode === 'full' ? 'Full check' : 'Rules only') : 'Unchecked'}
                  {v.policy_snapshot ? `, policy ${v.policy_snapshot.fingerprint}` : ''}
                </span>
              </div>
            ))}
            {prev ? (
              <div className="rounded-md bg-[#F8F9FB] p-4">
                <p className="mb-2 text-sm font-medium">
                  What changed from version {prev.number} to {shownVersion.number}
                </p>
                <Diff a={prev.content} b={shownVersion.content} />
              </div>
            ) : (
              <p className="text-sm muted">This is the first version, so there is nothing to compare yet.</p>
            )}
          </div>
        )}

        {tab === 'audit' && (
          <ol className="mt-4 space-y-2 text-sm">
            {d.audit.map((a) => (
              <li key={a.id} className="grid grid-cols-[130px_1fr] gap-3">
                <span className="text-graphite">{fmtTime(a.created_at)}</span>
                <span>
                  <span className="font-medium">{a.actor_name}</span> {ACTION_LABEL[a.action]?.toLowerCase() || a.action}
                  <AuditDetail action={a.action} detail={a.detail} />
                </span>
              </li>
            ))}
          </ol>
        )}

        {tab === 'policy' && (
          <div className="mt-4 text-sm">
            {shownVersion.policy_snapshot ? (
              <>
                <p className="muted">
                  Version {d.shown} was checked on {fmtTime(shownVersion.policy_snapshot.taken_at)} against policy set {shownVersion.policy_snapshot.fingerprint}:{' '}
                  {shownVersion.policy_snapshot.terms} terminology entries and {shownVersion.policy_snapshot.rules} active rules.
                </p>
                <h3 className="mt-4 font-semibold">Used as evidence</h3>
                <ul className="mt-1 list-disc pl-5">
                  {shownVersion.policy_snapshot.sources.map((x: any) => (
                    <li key={x.id}>
                      {x.title}, v{x.version}
                    </li>
                  ))}
                </ul>
                {shownVersion.policy_snapshot.excluded?.length > 0 && (
                  <>
                    <h3 className="mt-4 font-semibold">Excluded (not approved or not yet effective)</h3>
                    <ul className="mt-1 list-disc pl-5 text-graphite">
                      {shownVersion.policy_snapshot.excluded.map((x: any) => (
                        <li key={x.id}>
                          {x.title}, v{x.version} ({x.status})
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p className="muted">No policy snapshot recorded.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function AuditDetail({ action, detail }: { action: string; detail: any }) {
  if (!detail) return null;
  const bits: string[] = [];
  if (detail.version) bits.push(`v${detail.version}`);
  if (action === 'analysis_completed') bits.push(`${detail.mode === 'full' ? 'full check' : 'rules only'}, ${detail.findings} findings, policy ${detail.policy_fingerprint}`);
  if (detail.hash) bits.push(`fingerprint ${detail.hash}`);
  if (detail.override) bits.push('override');
  if (detail.finding) bits.push(`“${detail.finding}”`);
  if (detail.reason) bits.push(detail.reason);
  if (detail.note) bits.push(detail.note);
  return bits.length ? <span className="text-graphite">: {bits.join(', ')}</span> : null;
}

function Diff({ a, b }: { a: string; b: string }) {
  const ops = diffWords(a, b);
  return (
    <p className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed">
      {ops.map((o, i) =>
        o.op === 'same' ? (
          <span key={i}>{o.text}</span>
        ) : o.op === 'add' ? (
          <ins key={i} className="bg-[#DDEFE3] no-underline">
            {o.text}
          </ins>
        ) : (
          <del key={i} className="bg-[#F8E3DF] text-graphite">
            {o.text}
          </del>
        )
      )}
    </p>
  );
}
