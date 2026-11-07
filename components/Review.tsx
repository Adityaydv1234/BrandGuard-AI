'use client';
import { useState } from 'react';
import { CATEGORY_LABEL, Severity, VERDICT_LABEL } from './ui';

export interface Finding {
  id: number;
  category: string;
  verdict: string;
  severity: string;
  span_text: string | null;
  span_start: number | null;
  span_end: number | null;
  title: string;
  rationale: string;
  suggestion: string | null;
  evidence: { source_id: number; title: string; version: string; ref: string; excerpt: string }[];
  engine: string;
  resolution: string;
  resolution_note: string | null;
  resolved_by_name: string | null;
}

const RANK: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };

/** Renders the draft like a marked-up proof. Overlaps show the most severe mark. */
export function ProofView({
  content,
  findings,
  numbers,
  active,
  onPick,
}: {
  content: string;
  findings: Finding[];
  numbers: Map<number, number>;
  active: number | null;
  onPick: (id: number) => void;
}) {
  const spans = findings.filter(
    (f) => f.span_start != null && f.span_end != null && f.span_end! <= content.length && content.slice(f.span_start!, f.span_end!).length > 0
  );
  const cuts = new Set<number>([0, content.length]);
  spans.forEach((f) => {
    cuts.add(f.span_start!);
    cuts.add(f.span_end!);
  });
  const pts = Array.from(cuts).sort((a, b) => a - b);
  const pieces: JSX.Element[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1];
    const text = content.slice(a, b);
    const cover = spans.filter((f) => f.span_start! <= a && f.span_end! >= b);
    if (!cover.length) {
      pieces.push(<span key={i}>{text}</span>);
      continue;
    }
    const open = cover.filter((f) => !['dismissed', 'accepted'].includes(f.resolution));
    const top = [...(open.length ? open : cover)].sort((x, y) => RANK[x.severity] - RANK[y.severity])[0];
    const resolved = !open.length;
    const endsHere = cover.filter((f) => f.span_end === b);
    const isActive = cover.some((f) => f.id === active);
    pieces.push(
      <span
        key={i}
        role="button"
        tabIndex={0}
        onClick={() => onPick(top.id)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(top.id))}
        className={`mark ${resolved ? 'mark-resolved' : `mark-${top.severity}`} ${isActive ? 'mark-active' : ''}`}
        aria-label={`Finding ${numbers.get(top.id)}: ${top.title}`}
      >
        {text}
        {endsHere.length > 0 && <sup>{endsHere.map((f) => numbers.get(f.id)).join(',')}</sup>}
      </span>
    );
  }
  return <div className="whitespace-pre-wrap break-words font-serif text-[18px] leading-[1.75] text-ink">{pieces}</div>;
}

const RES_LABEL: Record<string, string> = {
  disputed: 'Disputed',
  dismissed: 'Dismissed',
  upheld: 'Upheld by reviewer',
  accepted: 'Fix applied',
};

export function FindingCard({
  f,
  n,
  active,
  canAct,
  perms,
  onApply,
  onAction,
  onPick,
}: {
  f: Finding;
  n: number;
  active: boolean;
  canAct: boolean;
  perms: { canEdit: boolean; canDispute: boolean; canDismiss: boolean };
  onApply: (f: Finding) => void;
  onAction: (f: Finding, action: string, note?: string) => Promise<void>;
  onPick: (id: number) => void;
}) {
  const [mode, setMode] = useState<null | 'dispute' | 'dismiss'>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const supported = f.verdict === 'supported';
  const settled = ['dismissed', 'accepted'].includes(f.resolution);

  const run = async (action: string, withNote?: string) => {
    setBusy(true);
    try {
      await onAction(f, action, withNote);
      setMode(null);
      setNote('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      id={`finding-${f.id}`}
      onClick={() => onPick(f.id)}
      className={`rounded-lg border bg-sheet p-4 transition-colors ${active ? 'border-ink' : 'border-rule'} ${settled ? 'opacity-75' : ''}`}
    >
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-[#EEF1F4] px-1.5 text-xs font-bold" aria-hidden>
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <Severity severity={f.severity} />
            <span className="text-graphite">{VERDICT_LABEL[f.verdict]}</span>
            <span className="text-graphite">{CATEGORY_LABEL[f.category] || f.category}</span>
            <span className="text-graphite">{f.engine === 'ai' ? 'AI, evidence-checked' : 'Rule'}</span>
          </div>
          <h3 className="mt-1 font-semibold leading-snug">{f.title}</h3>
        </div>
      </header>

      {f.span_text && (
        <p className="mt-3 border-l-2 border-rule pl-3 font-serif text-[15px] italic text-graphite">“{f.span_text}”</p>
      )}
      <p className="mt-3 text-sm leading-relaxed">{f.rationale}</p>

      {f.evidence?.length > 0 ? (
        <div className="mt-3 space-y-2">
          {f.evidence.map((e, i) => (
            <figure key={i} className="rounded-md bg-[#F4F6F8] px-3 py-2">
              <figcaption className="text-xs font-semibold text-graphite">
                {e.title}, v{e.version}, {e.ref}
              </figcaption>
              <blockquote className="mt-1 font-serif text-[14px] leading-relaxed">{e.excerpt}</blockquote>
            </figure>
          ))}
        </div>
      ) : (
        !supported && (
          <p className="mt-3 text-xs text-graphite">
            {f.verdict === 'insufficient'
              ? 'No approved, currently effective source establishes this. That is not proof it is false: add evidence to the library or ask the reviewer.'
              : 'Built-in check; no source document cited.'}
          </p>
        )
      )}

      {f.suggestion && !supported && (
        <div className="mt-3 rounded-md border border-[#CFE0F3] bg-[#F3F8FD] px-3 py-2 text-sm">
          <span className="font-semibold text-mark-low">Suggested: </span>
          {f.suggestion}
        </div>
      )}

      {f.resolution !== 'open' && f.resolution !== 'n/a' && (
        <p className="mt-3 text-sm">
          <span className="font-semibold">{RES_LABEL[f.resolution] || f.resolution}</span>
          {f.resolved_by_name && <span className="text-graphite"> by {f.resolved_by_name}</span>}
          {f.resolution_note && <span className="text-graphite">: {f.resolution_note}</span>}
        </p>
      )}

      {canAct && !supported && (
        <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {perms.canEdit && f.suggestion && f.resolution !== 'accepted' && (
            <button className="btn-ghost py-1.5" onClick={() => onApply(f)} disabled={busy}>
              Apply fix
            </button>
          )}
          {perms.canDispute && f.resolution === 'open' && (
            <button className="btn-ghost py-1.5" onClick={() => setMode(mode === 'dispute' ? null : 'dispute')} disabled={busy}>
              Dispute
            </button>
          )}
          {perms.canDismiss && ['open', 'disputed', 'upheld'].includes(f.resolution) && (
            <button className="btn-ghost py-1.5" onClick={() => setMode(mode === 'dismiss' ? null : 'dismiss')} disabled={busy}>
              Dismiss
            </button>
          )}
          {perms.canDismiss && ['open', 'disputed'].includes(f.resolution) && (
            <button className="btn-ghost py-1.5" onClick={() => run('uphold')} disabled={busy}>
              Uphold
            </button>
          )}
          {(perms.canDismiss || perms.canDispute) && !['open', 'n/a'].includes(f.resolution) && (
            <button className="btn-link py-1.5" onClick={() => run('reopen')} disabled={busy}>
              Reopen
            </button>
          )}
        </div>
      )}

      {mode && (
        <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
          <label className="label text-xs" htmlFor={`note-${f.id}`}>
            {mode === 'dispute' ? 'Why is this flag wrong? The reviewer will see this.' : 'Why is this acceptable? Recorded in the audit trail.'}
          </label>
          <textarea id={`note-${f.id}`} className="field min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary py-1.5" disabled={busy || note.trim().length < 5} onClick={() => run(mode, note)}>
              {mode === 'dispute' ? 'Send dispute' : 'Dismiss finding'}
            </button>
            <button className="btn-link" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/** Apply a suggestion to the editor text. Prefers exact offsets, falls back to nearest occurrence. */
export function applyTextFix(text: string, original: string, f: Finding): string | null {
  if (!f.span_text || f.suggestion == null) return null;
  if (text === original && f.span_start != null && original.slice(f.span_start, f.span_end!) === f.span_text)
    return text.slice(0, f.span_start) + f.suggestion + text.slice(f.span_end!);
  const lower = text.toLowerCase();
  const needle = f.span_text.toLowerCase();
  let best = -1,
    pos = lower.indexOf(needle);
  while (pos >= 0) {
    if (best < 0 || Math.abs(pos - (f.span_start || 0)) < Math.abs(best - (f.span_start || 0))) best = pos;
    pos = lower.indexOf(needle, pos + 1);
  }
  if (best < 0) return null;
  return text.slice(0, best) + f.suggestion + text.slice(best + f.span_text.length);
}

/** Colour findings carry their fix in the title/suggestion. */
export function applyColorFix<T extends { label: string; fg: string; bg: string }>(pairs: T[], f: Finding): T[] | null {
  const hex = f.suggestion?.match(/#[0-9A-F]{6}/i)?.[0]?.toUpperCase();
  if (!hex) return null;
  const label = f.title.split(':')[0];
  const idx = pairs.findIndex((p) => p.label === label);
  if (idx < 0) return null;
  const role = f.title.match(/: (text|background) colour/)?.[1];
  const key = f.title.includes('contrast') ? 'fg' : role === 'background' ? 'bg' : 'fg';
  return pairs.map((p, i) => (i === idx ? { ...p, [key]: hex } : p));
}
