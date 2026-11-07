'use client';
import { useState } from 'react';
import { api, ErrorNote, useMe } from '@/components/ui';

const PERSONA_COPY: Record<string, string> = {
  creator: 'Write or upload a draft, see what breaks the guidelines, fix it and send it for review.',
  reviewer: 'Check findings against the cited sources, comment, then approve, reject or request changes.',
  admin: 'Manage the approved sources, terminology, claim rules and palette the checks rely on.',
};

export default function Login() {
  const { me } = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await api('/api/auth', { method: 'POST', json: { userId: id } });
      window.location.href = '/';
    } catch (e: any) {
      setError(e.message);
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto grid min-h-screen max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[1.15fr_1fr] lg:items-center">
      <section>
        <p className="font-serif text-2xl font-semibold">BrandGuard</p>
        <h1 className="mt-6 max-w-xl font-serif text-4xl leading-tight sm:text-5xl">
          Check every draft against what your brand has actually approved.
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed muted">
          BrandGuard reads a draft, compares each claim and phrase with your approved product facts, voice guide and visual rules, cites the source behind every flag, and leaves the final call to a named reviewer.
        </p>
        <div className="mt-10 max-w-lg">
          <h2 className="font-semibold">Try the whole workflow in about two minutes</h2>
          <ol className="mt-3 space-y-2 text-sm leading-relaxed muted">
            <li><span className="font-semibold text-ink">1.</span> Sign in as Priya (creator) and open <em>New draft</em>.</li>
            <li><span className="font-semibold text-ink">2.</span> Load the “Risky festive campaign” sample and check it.</li>
            <li><span className="font-semibold text-ink">3.</span> Read the cited sources, apply the suggested fixes, save, and submit for review.</li>
            <li><span className="font-semibold text-ink">4.</span> Switch to Arjun (reviewer) from the top bar and approve or request changes.</li>
            <li><span className="font-semibold text-ink">5.</span> Switch back to Priya and edit the approved draft: the approval no longer applies.</li>
          </ol>
        </div>
      </section>
      <section aria-labelledby="choose" className="panel p-6 sm:p-8">
        <h2 id="choose" className="text-lg font-semibold">Choose a demo account</h2>
        <p className="mt-1 text-sm muted">No password. Each account has different permissions, enforced on the server.</p>
        <div className="mt-6 space-y-3">
          {(me?.users || []).map((u) => (
            <button
              key={u.id}
              onClick={() => go(u.id)}
              disabled={!!busy}
              className="w-full rounded-lg border border-rule bg-white p-4 text-left transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F5F92] disabled:opacity-60"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{u.name}</span>
                <span className="text-sm muted">{u.title}</span>
              </span>
              <span className="mt-1 block text-sm muted">{PERSONA_COPY[u.role]}</span>
              {busy === u.id && <span className="mt-2 block text-sm text-mark-low">Signing in…</span>}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <ErrorNote error={error} />
        </div>
        <p className="mt-6 text-xs leading-relaxed muted">
          {me?.ai.provider === 'none'
            ? 'This deployment has no AI key, so claims are checked with deterministic rules only.'
            : `Claim verification uses ${me?.ai.endpoint} (model ${me?.ai.model}). Draft text and matching source excerpts are sent to that service; nothing else is.`}{' '}
          PayNova and all its documents are fictional.
        </p>
      </section>
    </div>
  );
}
