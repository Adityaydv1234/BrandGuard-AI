'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, Empty, ErrorNote, fmtTime, StatusPill, useMe } from '@/components/ui';

interface Row {
  id: number;
  title: string;
  channel: string;
  status: string;
  current_version: number;
  updated_at: string;
  creator_name: string;
  creator_id: string;
  open_findings: number;
  high_findings: number;
}

const GUIDE: Record<string, { heading: string; steps: string[] }> = {
  creator: {
    heading: 'Next step for you',
    steps: [
      'Open New draft, load the “Risky festive campaign” sample and select Check draft.',
      'Each flag cites the approved source behind it. Apply a fix, edit in your own words, or dispute it with a reason.',
      'Save the new version (it is re-checked automatically), then submit it for review.',
    ],
  },
  reviewer: {
    heading: 'Next step for you',
    steps: [
      'Open a draft marked In review. The agency email is waiting for you.',
      'Run the full check if it was only rule-checked, then read each finding next to its cited source.',
      'Dismiss findings you disagree with (a reason is required), then approve, reject or request changes.',
    ],
  },
  admin: {
    heading: 'What you can do',
    steps: [
      'Sources and rules: upload a PDF or DOCX, approve it, or mark an old version obsolete. Only approved, effective sources are used as evidence.',
      'Add terminology and claim rules; they apply on the next check.',
      'Insights shows which rules are triggered most and which are disputed, a sign the guideline may be unclear.',
    ],
  },
};

export default function Queue() {
  const { me } = useMe();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.user) return;
    api<{ submissions: Row[] }>('/api/submissions')
      .then((d) => setRows(d.submissions))
      .catch((e) => setError(e.message));
  }, [me?.user]);

  const role = me?.user?.role || 'creator';
  const guide = GUIDE[role];
  const mine = (r: Row) => r.creator_id === me?.user?.id;
  const waiting = rows?.filter((r) => r.status === 'UNDER_REVIEW' && role !== 'creator').length || 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold">{role === 'reviewer' ? 'Review queue' : 'Drafts'}</h1>
            <p className="mt-1 muted">
              {role === 'reviewer'
                ? waiting
                  ? `${waiting} draft${waiting > 1 ? 's' : ''} waiting for your decision.`
                  : 'Nothing is waiting for you right now.'
                : 'Every draft is checked before anyone can approve it.'}
            </p>
          </div>
          {role !== 'reviewer' && (
            <Link href="/new" className="btn-primary">
              New draft
            </Link>
          )}
        </div>
        <div className="mt-6">
          <ErrorNote error={error} />
          {!rows && !error && <p className="muted">Loading drafts…</p>}
          {rows && rows.length === 0 && (
            <Empty title="No drafts yet">
              <Link className="btn-link" href="/new">
                Start a draft
              </Link>{' '}
              to see BrandGuard check it.
            </Empty>
          )}
          {rows && rows.length > 0 && (
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-rule text-graphite">
                  <tr>
                    <th className="px-4 py-3 font-medium">Draft</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Open issues</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-rule last:border-0 hover:bg-[#F8F9FB]">
                      <td className="px-4 py-3">
                        <Link href={`/s/${r.id}`} className="font-semibold hover:underline">
                          {r.title}
                        </Link>
                        <div className="text-graphite">
                          {r.channel}, by {mine(r) ? 'you' : r.creator_name}, version {r.current_version}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-4 py-3">
                        {r.open_findings === 0 ? (
                          <span className="text-mark-ok">None</span>
                        ) : (
                          <span>
                            {r.open_findings}
                            {r.high_findings > 0 && <span className="ml-1 font-semibold text-mark-high">({r.high_findings} high)</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-graphite">{fmtTime(r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      <aside className="space-y-4">
        <div className="panel p-5">
          <h2 className="font-semibold">{guide.heading}</h2>
          <ol className="mt-3 space-y-3 text-sm leading-relaxed text-graphite">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-semibold text-ink">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-rule pt-3 text-sm muted">Switch accounts from the top bar to play another role.</p>
        </div>
        <div className="panel p-5 text-sm leading-relaxed text-graphite">
          <h2 className="font-semibold text-ink">How a draft moves</h2>
          <p className="mt-2">
            Draft, then In review, then Approved or Rejected (or back to the creator with Changes requested). An approval is tied to the exact content
            fingerprint it was given to, so any later edit cancels it.
          </p>
        </div>
      </aside>
    </div>
  );
}
