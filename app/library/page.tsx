'use client';
import { useEffect, useRef, useState } from 'react';
import { api, ErrorNote, Severity, useMe } from '@/components/ui';

interface Lib {
  sources: any[];
  terms: any[];
  rules: any[];
  workspace: { name: string; palette: { name: string; hex: string }[] };
  ai: { provider: string; model: string; embeddings: boolean; endpoint: string };
}

const KIND_LABEL: Record<string, string> = {
  product: 'Product facts',
  voice: 'Voice guide',
  visual: 'Visual identity',
  offer: 'Offer',
  legal: 'Legal',
  other: 'Other',
};

export default function Library() {
  const { me } = useMe();
  const admin = me?.user?.role === 'admin';
  const [lib, setLib] = useState<Lib | null>(null);
  const [tab, setTab] = useState<'sources' | 'terms' | 'rules' | 'palette'>('sources');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    api<Lib>('/api/library').then(setLib).catch((e) => setError(e.message));
  }, []);

  const post = async (body: any, ok?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setLib(await api<Lib>('/api/library', { method: 'POST', json: body }));
      if (ok) setNotice(ok);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!lib) return error ? <ErrorNote error={error} /> : <p className="muted">Loading library…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Sources and rules</h1>
        <p className="mt-1 max-w-3xl muted">
          Everything BrandGuard is allowed to check against. Only sources marked approved, with an effective date that has arrived, are used as evidence.
          {!admin && ' You can read this library; switch to Meera (admin) to change it.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-6 border-b border-rule" role="tablist">
        {(
          [
            ['sources', `Source documents (${lib.sources.length})`],
            ['terms', `Terminology (${lib.terms.length})`],
            ['rules', `Claim and tone rules (${lib.rules.length})`],
            ['palette', 'Palette'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'tab-active' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <ErrorNote error={error} />
      {notice && <p className="rounded-md bg-[#E1EFE6] px-3 py-2 text-sm text-mark-ok">{notice}</p>}

      {tab === 'sources' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            {lib.sources.map((s) => (
              <div key={s.id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">
                      {s.title} <span className="font-normal text-graphite">v{s.version}</span>
                    </h2>
                    <p className="text-sm text-graphite">
                      {KIND_LABEL[s.kind] || s.kind}, owner {s.owner}, effective {s.effective_date}, {s.chunks} citable sections
                      {s.file_name ? `, from ${s.file_name}` : ''}
                    </p>
                    <p className={`mt-1 text-sm font-medium ${s.eligible ? 'text-mark-ok' : 'text-mark-med'}`}>
                      {s.eligible
                        ? 'Used as evidence'
                        : s.status === 'approved'
                        ? 'Approved, but not effective until ' + s.effective_date
                        : s.status === 'obsolete'
                        ? 'Obsolete: never cited'
                        : 'Draft: never cited until approved'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {admin ? (
                      <select
                        aria-label={`Status of ${s.title}`}
                        className="field w-auto py-1.5"
                        value={s.status}
                        disabled={busy}
                        onChange={(e) => post({ action: 'source_status', id: s.id, status: e.target.value }, `${s.title} is now ${e.target.value}.`)}
                      >
                        <option value="approved">Approved</option>
                        <option value="draft">Draft</option>
                        <option value="obsolete">Obsolete</option>
                      </select>
                    ) : (
                      <span className="text-sm capitalize text-graphite">{s.status}</span>
                    )}
                    <button className="btn-link" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                      {open === s.id ? 'Hide text' : 'Read'}
                    </button>
                  </div>
                </div>
                {open === s.id && (
                  <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-[#F4F6F8] p-3 font-serif text-[14px] leading-relaxed">
                    {s.body.replace(/\[\[page (\d+)\]\]/g, '— page $1 —')}
                  </pre>
                )}
              </div>
            ))}
          </div>
          {admin ? <AddSource onDone={(l, msg) => (setLib(l), setNotice(msg))} onError={setError} /> : <ReadOnlyNote />}
        </div>
      )}

      {tab === 'terms' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-rule text-graphite">
                <tr>
                  <th className="px-4 py-3 font-medium">Avoid</th>
                  <th className="px-4 py-3 font-medium">Use instead</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Why</th>
                  {admin && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {lib.terms.map((t) => (
                  <tr key={t.id} className="border-b border-rule last:border-0">
                    <td className="px-4 py-3 text-mark-high line-through decoration-1">{t.banned}</td>
                    <td className="px-4 py-3 font-medium">{t.preferred}</td>
                    <td className="px-4 py-3">
                      <Severity severity={t.severity} />
                    </td>
                    <td className="px-4 py-3 text-graphite">{t.note}</td>
                    {admin && (
                      <td className="px-4 py-3 text-right">
                        <button className="btn-link text-mark-high" disabled={busy} onClick={() => post({ action: 'delete_term', id: t.id }, 'Term removed.')}>
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {admin ? <AddTerm onSubmit={(b) => post({ action: 'add_term', ...b }, 'Term added. It applies on the next check.')} busy={busy} /> : <ReadOnlyNote />}
        </div>
      )}

      {tab === 'rules' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            {lib.rules.map((r) => {
              const src = lib.sources.find((s) => s.id === r.source_id);
              return (
                <div key={r.id} className={`panel p-4 ${r.active ? '' : 'opacity-60'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="font-semibold">{r.name}</h2>
                        <Severity severity={r.severity} />
                        <span className="text-xs text-graphite">{r.verdict === 'contradicted' ? 'Contradicts a source' : 'Guideline'}</span>
                      </div>
                      <p className="mt-1 text-sm">{r.message}</p>
                      <p className="mt-1 text-xs text-graphite">
                        {src ? `Cites ${src.title} ${r.ref || ''}. ` : 'No source cited. '}
                        {r.suggestion ? `Suggests “${r.suggestion}”.` : ''}
                      </p>
                      <details className="mt-1 text-xs text-graphite">
                        <summary className="cursor-pointer">Pattern</summary>
                        <code className="mt-1 block break-all rounded bg-[#F4F6F8] p-2">{r.pattern}</code>
                      </details>
                    </div>
                    {admin && (
                      <div className="flex gap-3">
                        <button className="btn-link" disabled={busy} onClick={() => post({ action: 'toggle_rule', id: r.id, active: !r.active }, r.active ? 'Rule paused.' : 'Rule active.')}>
                          {r.active ? 'Pause' : 'Activate'}
                        </button>
                        <button className="btn-link text-mark-high" disabled={busy} onClick={() => post({ action: 'delete_rule', id: r.id }, 'Rule removed.')}>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {admin ? (
            <AddRule sources={lib.sources} busy={busy} onSubmit={(b) => post({ action: 'add_rule', ...b }, 'Rule added. It applies on the next check.')} />
          ) : (
            <ReadOnlyNote />
          )}
        </div>
      )}

      {tab === 'palette' && <Palette palette={lib.workspace.palette} admin={admin} busy={busy} onSave={(p) => post({ action: 'palette', palette: p }, 'Palette saved.')} />}

      <p className="text-xs muted">
        AI provider: {lib.ai.provider === 'none' ? 'none configured (rules only)' : `${lib.ai.endpoint}, model ${lib.ai.model}`}. Retrieval:{' '}
        {lib.ai.embeddings ? 'keyword plus embeddings (hybrid)' : 'keyword (BM25)'}. Source text never leaves this server except the excerpts sent with a claim being verified.
      </p>
    </div>
  );
}

function ReadOnlyNote() {
  return (
    <aside className="panel h-fit p-5 text-sm text-graphite">
      Only the workspace admin can change this library, so the facts reviewers rely on stay controlled. Switch to Meera (admin) in the top bar to try it.
    </aside>
  );
}

function AddSource({ onDone, onError }: { onDone: (l: Lib, msg: string) => void; onError: (e: string) => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('product');
  const [version, setVersion] = useState('1.0');
  const [status, setStatus] = useState('approved');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const file = fileRef.current?.files?.[0];
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', title || file.name.replace(/\.[^.]+$/, ''));
        fd.append('kind', kind);
        fd.append('version', version);
        fd.append('status', status);
        fd.append('effective_date', date);
        const r = await api<Lib & { created: { chunks: number }; warnings: string[] }>('/api/library/upload', { method: 'POST', body: fd });
        onDone(r, `Added with ${r.created.chunks} citable sections.${r.warnings.length ? ' ' + r.warnings.join(' ') : ''}`);
      } else {
        const r = await api<Lib>('/api/library', { method: 'POST', json: { action: 'add_source', title, kind, version, status, effective_date: date, body } });
        onDone(r, 'Source added.');
      }
      setTitle('');
      setBody('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel h-fit space-y-3 p-5">
      <h2 className="font-semibold">Add a source</h2>
      <p className="text-sm muted">Upload a PDF, DOCX or TXT, or paste text. Lines starting with “§3” become citable sections.</p>
      <div>
        <label className="label" htmlFor="st">
          Title
        </label>
        <input id="st" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Refund policy" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="sk">
            Type
          </label>
          <select id="sk" className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sv">
            Version
          </label>
          <input id="sv" className="field" value={version} onChange={(e) => setVersion(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ss">
            Status
          </label>
          <select id="ss" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="approved">Approved</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sd">
            Effective from
          </label>
          <input id="sd" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="sf">
          File
        </label>
        <input id="sf" ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="block w-full text-sm" />
      </div>
      <div>
        <label className="label" htmlFor="sb">
          Or paste text
        </label>
        <textarea id="sb" className="field min-h-[120px]" value={body} onChange={(e) => setBody(e.target.value)} placeholder={'§1 Refunds\nRefunds are processed within 5 business days.'} />
      </div>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Indexing…' : 'Add source'}
      </button>
    </form>
  );
}

function AddTerm({ onSubmit, busy }: { onSubmit: (b: any) => Promise<boolean>; busy: boolean }) {
  const [f, setF] = useState({ banned: '', preferred: '', note: '', severity: 'medium' });
  return (
    <form
      className="panel h-fit space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSubmit(f)) setF({ banned: '', preferred: '', note: '', severity: 'medium' });
      }}
    >
      <h2 className="font-semibold">Add a term</h2>
      {(
        [
          ['banned', 'Avoid', 'Pay Nova'],
          ['preferred', 'Use instead', 'PayNova'],
          ['note', 'Why (shown to creators)', 'Brand name is one word.'],
        ] as const
      ).map(([k, l, ph]) => (
        <div key={k}>
          <label className="label" htmlFor={`t-${k}`}>
            {l}
          </label>
          <input id={`t-${k}`} className="field" value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        </div>
      ))}
      <div>
        <label className="label" htmlFor="t-sev">
          Severity
        </label>
        <select id="t-sev" className="field" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <button className="btn-primary w-full" disabled={busy}>
        Add term
      </button>
    </form>
  );
}

function AddRule({ sources, onSubmit, busy }: { sources: any[]; onSubmit: (b: any) => Promise<boolean>; busy: boolean }) {
  const blank = { name: '', phrases: '', message: '', suggestion: '', severity: 'medium', category: 'claim', verdict: 'rule', source_id: '', ref: '' };
  const [f, setF] = useState(blank);
  return (
    <form
      className="panel h-fit space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSubmit(f)) setF(blank);
      }}
    >
      <h2 className="font-semibold">Add a rule</h2>
      <div>
        <label className="label" htmlFor="r-name">
          Name
        </label>
        <input id="r-name" className="field" value={f.name} placeholder="Cashback promise" onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="r-ph">
          Phrases to catch (one per line)
        </label>
        <textarea id="r-ph" className="field min-h-[70px]" value={f.phrases} placeholder={'cashback\nmoney back'} onChange={(e) => setF({ ...f, phrases: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="r-msg">
          Why it is a problem
        </label>
        <textarea id="r-msg" className="field min-h-[60px]" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="r-sug">
          Suggested wording (optional)
        </label>
        <input id="r-sug" className="field" value={f.suggestion} onChange={(e) => setF({ ...f, suggestion: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="r-sev">
            Severity
          </label>
          <select id="r-sev" className="field" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="r-cat">
            Category
          </label>
          <select id="r-cat" className="field" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="claim">Claim</option>
            <option value="tone">Tone</option>
            <option value="terminology">Terminology</option>
            <option value="security">Security</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="r-src">
            Cite source
          </label>
          <select id="r-src" className="field" value={f.source_id} onChange={(e) => setF({ ...f, source_id: e.target.value })}>
            <option value="">None</option>
            {sources
              .filter((s) => s.status === 'approved')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="r-ref">
            Section
          </label>
          <input id="r-ref" className="field" value={f.ref} placeholder="§2" onChange={(e) => setF({ ...f, ref: e.target.value })} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.verdict === 'contradicted'} onChange={(e) => setF({ ...f, verdict: e.target.checked ? 'contradicted' : 'rule' })} />
        The cited source contradicts these phrases
      </label>
      <button className="btn-primary w-full" disabled={busy}>
        Add rule
      </button>
    </form>
  );
}

function Palette({ palette, admin, busy, onSave }: { palette: { name: string; hex: string }[]; admin: boolean; busy: boolean; onSave: (p: any[]) => void }) {
  const [p, setP] = useState(palette);
  useEffect(() => setP(palette), [palette]);
  return (
    <div className="panel max-w-2xl space-y-4 p-5">
      <p className="text-sm muted">Colours supplied with a draft are compared with this palette, and text pairs are tested for WCAG 2.2 contrast.</p>
      <ul className="space-y-2">
        {p.map((c, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="h-9 w-9 rounded border border-rule" style={{ background: c.hex }} aria-hidden />
            {admin ? (
              <>
                <input aria-label="Colour name" className="field" value={c.name} onChange={(e) => setP(p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input aria-label="Hex value" className="field w-32 font-mono" value={c.hex} onChange={(e) => setP(p.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} />
                <button className="btn-link text-mark-high" onClick={() => setP(p.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </>
            ) : (
              <span className="text-sm">
                <span className="font-medium">{c.name}</span> <span className="text-graphite">{c.hex}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {admin && (
        <div className="flex gap-3">
          <button className="btn-ghost" onClick={() => setP([...p, { name: 'New colour', hex: '#000000' }])}>
            Add colour
          </button>
          <button className="btn-primary" disabled={busy} onClick={() => onSave(p)}>
            Save palette
          </button>
        </div>
      )}
    </div>
  );
}
