'use client';
import { useEffect, useState } from 'react';
import { api, CATEGORY_LABEL, Empty, ErrorNote } from '@/components/ui';

interface Data {
  byStatus: { status: string; n: number }[];
  firstCheck: { category: string; n: number }[];
  remaining: { category: string; n: number }[];
  recurring: { rule_key: string; title: string; category: string; hits: number; submissions: number }[];
  contested: { rule_key: string; title: string; dismissed: number; disputed: number; total: number; sample_note: string | null }[];
  decisions: { decision: string; n: number; overrides: number }[];
  turnaroundHours: number | null;
  engines: { engine: string; verdict: string; n: number }[];
  acceptedSuggestions: number;
  invalidatedApprovals: number;
  injectionAttempts: number;
}

function Bars({ rows, label }: { rows: { category: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <p className="text-sm muted">Nothing to show yet.</p>;
  return (
    <ul className="space-y-2" aria-label={label}>
      {rows.map((r) => (
        <li key={r.category} className="grid grid-cols-[110px_1fr_28px] items-center gap-3 text-sm">
          <span>{CATEGORY_LABEL[r.category] || r.category}</span>
          <span className="h-3 rounded-sm bg-[#EEF1F4]">
            <span className="block h-3 rounded-sm bg-ink" style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Insights() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Data>('/api/insights').then(setD).catch((e) => setError(e.message));
  }, []);
  if (error) return <ErrorNote error={error} />;
  if (!d) return <p className="muted">Loading insights…</p>;

  const n = (s: string) => d.byStatus.find((x) => x.status === s)?.n || 0;
  const total = d.byStatus.reduce((a, b) => a + b.n, 0);
  const overrides = d.decisions.reduce((a, b) => a + b.overrides, 0);
  const aiRows = d.engines.filter((e) => e.engine === 'ai');
  const aiTotal = aiRows.reduce((a, b) => a + b.n, 0);
  const aiInsufficient = aiRows.filter((e) => e.verdict === 'insufficient').reduce((a, b) => a + b.n, 0);

  const stats: [string, string, string][] = [
    ['Drafts checked', String(total), `${n('APPROVED')} approved, ${n('UNDER_REVIEW')} in review`],
    ['Suggested fixes applied', String(d.acceptedSuggestions), 'Creators accepting a correction'],
    ['Approvals cancelled by edits', String(d.invalidatedApprovals), 'Content changed after sign-off'],
    ['Reviewer overrides', String(overrides), 'Approved despite a high-severity flag'],
    ['Prompt-injection attempts', String(d.injectionAttempts), 'Instructions aimed at the AI, ignored'],
    ['Average time to approval', d.turnaroundHours == null ? 'No data' : `${d.turnaroundHours.toFixed(1)} h`, 'From draft creation to approval'],
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Governance insights</h1>
        <p className="mt-1 max-w-3xl muted">What goes wrong repeatedly, and where reviewers and creators disagree with the guidelines. Counts come from this workspace&rsquo;s own review history, which is small in the demo.</p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([k, v, s]) => (
          <div key={k} className="panel p-4">
            <dt className="text-sm muted">{k}</dt>
            <dd className="mt-1 font-serif text-3xl font-semibold">{v}</dd>
            <dd className="text-sm muted">{s}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-semibold">Mistakes caught on first check</h2>
          <p className="mb-4 text-sm muted">Findings in each draft&rsquo;s first version, by type.</p>
          <Bars rows={d.firstCheck} label="First check findings by category" />
        </section>
        <section className="panel p-5">
          <h2 className="font-semibold">Still open in current versions</h2>
          <p className="mb-4 text-sm muted">Unresolved findings that a reviewer will have to deal with.</p>
          <Bars rows={d.remaining} label="Open findings by category" />
        </section>
      </div>

      <section className="panel p-5">
        <h2 className="font-semibold">Repeated mistakes</h2>
        <p className="mb-3 text-sm muted">The checks triggered most often. Consider training or a clearer template for these.</p>
        {d.recurring.length === 0 ? (
          <Empty title="No findings yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-rule text-graphite">
                <tr>
                  <th className="py-2 pr-4 font-medium">Check</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Times flagged</th>
                  <th className="py-2 font-medium">Drafts affected</th>
                </tr>
              </thead>
              <tbody>
                {d.recurring.map((r) => (
                  <tr key={r.rule_key} className="border-b border-rule last:border-0">
                    <td className="py-2 pr-4 font-medium">{r.title}</td>
                    <td className="py-2 pr-4 text-graphite">{CATEGORY_LABEL[r.category] || r.category}</td>
                    <td className="py-2 pr-4 tabular-nums">{r.hits}</td>
                    <td className="py-2 tabular-nums">{r.submissions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Where the guidelines may be unclear</h2>
        <p className="mb-3 text-sm muted">Rules that people dismissed or disputed. A rule that is often challenged may need clearer wording, an exception, or better evidence.</p>
        {d.contested.length === 0 ? (
          <p className="text-sm muted">No finding has been dismissed or disputed yet. Dismiss or dispute one on a draft and it will appear here.</p>
        ) : (
          <ul className="space-y-3">
            {d.contested.map((c) => (
              <li key={c.rule_key} className="rounded-md bg-[#F8F9FB] p-3 text-sm">
                <p className="font-semibold">{c.title}</p>
                <p className="text-graphite">
                  {c.dismissed} dismissed, {c.disputed} disputed, out of {c.total} flags ({Math.round(((c.dismissed + c.disputed) / c.total) * 100)}% challenged)
                </p>
                {c.sample_note && <p className="mt-1">Latest reason given: “{c.sample_note}”</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">How often the AI had to say “not enough evidence”</h2>
        {aiTotal === 0 ? (
          <p className="mt-1 text-sm muted">No AI claim checks have run yet. Run a full check on a draft (needs a model key).</p>
        ) : (
          <p className="mt-1 text-sm">
            {aiInsufficient} of {aiTotal} AI-checked claims had no approved source behind them. A high number points to gaps in the source library, not necessarily in the copy.
          </p>
        )}
      </section>
    </div>
  );
}
