'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, MeContext, ROLE_LABEL, type Me } from './ui';

export default function AppShell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const path = usePathname();
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/api/me'));
      setFailed(null);
    } catch (e: any) {
      setFailed(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (me && !me.user && path !== '/login') router.replace('/login');
  }, [me, path, router]);

  const switchTo = async (id: string) => {
    setSwitching(true);
    await api('/api/auth', { method: 'POST', json: { userId: id } });
    window.location.reload();
  };

  const signOut = async () => {
    await api('/api/auth', { method: 'DELETE' });
    window.location.href = '/login';
  };

  if (failed)
    return (
      <div className="mx-auto max-w-xl px-6 py-24">
        <h1 className="text-xl font-semibold">BrandGuard could not start</h1>
        <p className="mt-2 muted">The server returned: {failed}</p>
        <p className="mt-2 text-sm muted">Check DATABASE_URL and the server logs, then reload.</p>
      </div>
    );
  if (!me) return <div className="px-6 py-24 text-center muted">Preparing the PayNova demo workspace…</div>;
  if (path === '/login' || !me.user) return <MeContext.Provider value={{ me, refresh }}>{children}</MeContext.Provider>;

  const role = me.user.role;
  const nav = [
    { href: '/', label: role === 'reviewer' ? 'Review queue' : 'Drafts' },
    ...(role !== 'reviewer' ? [{ href: '/new', label: 'New draft' }] : []),
    { href: '/library', label: 'Sources and rules' },
    { href: '/insights', label: 'Insights' },
  ];

  return (
    <MeContext.Provider value={{ me, refresh }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-rule bg-sheet">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-serif text-xl font-semibold tracking-tight">BrandGuard</span>
            <span className="hidden text-sm muted sm:inline">PayNova workspace</span>
          </Link>
          <nav className="flex flex-wrap gap-5" aria-label="Main">
            {nav.map((n) => {
              const active = n.href === '/' ? path === '/' || path.startsWith('/s/') : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={`tab ${active ? 'tab-active' : ''}`} aria-current={active ? 'page' : undefined}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <label htmlFor="persona" className="text-sm muted">
              Signed in as
            </label>
            <select
              id="persona"
              className="field w-auto py-1.5"
              value={me.user.id}
              disabled={switching}
              onChange={(e) => switchTo(e.target.value)}
            >
              {me.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({ROLE_LABEL[u.role]})
                </option>
              ))}
            </select>
            <button className="btn-link" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      {me.ai.provider === 'none' && (
        <div className="border-b border-[#E9D3A8] bg-[#FBF4E6] px-5 py-2 text-center text-sm text-mark-med">
          AI claim verification is off because no model key is configured. Rule, terminology, colour and accessibility checks still run.
        </div>
      )}
      <main id="main" className="mx-auto max-w-7xl px-5 py-8">
        {children}
      </main>
      <footer className="mx-auto max-w-7xl px-5 pb-10 text-xs muted">
        BrandGuard AI prototype (CodeNexus India 2026). PayNova is fictional. Claim checks use{' '}
        {me.ai.provider === 'none' ? 'deterministic rules only' : `${me.ai.endpoint} (model ${me.ai.model}); draft text and relevant source excerpts are sent to that service`}
        . Final approval is always a named human decision.
      </footer>
    </MeContext.Provider>
  );
}
