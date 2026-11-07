'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ColorPairs, { type Pair } from '@/components/ColorPairs';
import { api, ErrorNote, useMe } from '@/components/ui';
import { SAMPLES } from '@/lib/samples';

const CHANNELS = ['Instagram', 'LinkedIn', 'Email', 'Website', 'Press release', 'Ad copy', 'Other'];

export default function NewDraft() {
  const { me } = useMe();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState('Instagram');
  const [content, setContent] = useState('');
  const [colors, setColors] = useState<Pair[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | 'upload' | 'check'>(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const aiOn = me?.ai.provider !== 'none';

  useEffect(() => {
    if (busy !== 'check') return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, 2)), 2200);
    return () => clearInterval(t);
  }, [busy]);

  if (me?.user?.role === 'reviewer')
    return (
      <div className="mx-auto max-w-xl py-12">
        <h1 className="font-serif text-2xl font-semibold">Reviewers do not create drafts</h1>
        <p className="mt-2 muted">Switch to Priya (creator) in the top bar to write a draft.</p>
      </div>
    );

  const loadSample = (key: string) => {
    const s = SAMPLES.find((x) => x.key === key)!;
    setTitle(s.title);
    setChannel(s.channel);
    setContent(s.content);
    setColors(s.colors.map((c) => ({ ...c })));
    setFileName(null);
    setNotes([]);
    setError(null);
  };

  const upload = async (file: File) => {
    setBusy('upload');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ text: string; warnings: string[]; fileName: string }>('/api/extract', { method: 'POST', body: fd });
      setContent(r.text);
      setFileName(r.fileName);
      setNotes(r.warnings);
      if (!title) setTitle(r.fileName.replace(/\.[^.]+$/, ''));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('check');
    setStage(0);
    setError(null);
    try {
      const r = await api<{ id: number }>('/api/submissions', { method: 'POST', json: { title, channel, content, colors, fileName } });
      router.push(`/s/${r.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(null);
    }
  };

  const stages = ['Running terminology, claim and colour rules', aiOn ? 'Finding approved evidence for each claim' : 'Preparing findings', aiOn ? 'Verifying claims against cited sources' : 'Saving version'];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <form onSubmit={submit} className="space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-semibold">New draft</h1>
          <p className="mt-1 muted">Paste copy or upload a file. It is checked as soon as you save it; nobody else sees it until you submit it for review.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <div>
            <label className="label" htmlFor="title">
              Title
            </label>
            <input id="title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Diwali campaign: Instagram caption" required />
          </div>
          <div>
            <label className="label" htmlFor="channel">
              Channel
            </label>
            <select id="channel" className="field" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
            <label className="label mb-0" htmlFor="content">
              Content
            </label>
            <div className="flex items-center gap-3 text-sm">
              {fileName && <span className="muted">From {fileName}</span>}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.html"
                className="sr-only"
                id="file"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
              <label htmlFor="file" className="btn-ghost cursor-pointer py-1.5">
                {busy === 'upload' ? 'Reading file…' : 'Upload PDF, DOCX or TXT'}
              </label>
            </div>
          </div>
          <textarea
            id="content"
            className="field min-h-[260px] font-serif text-[17px] leading-relaxed"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste the caption, post, email or page copy you want checked."
            required
          />
          {notes.map((n) => (
            <p key={n} className="mt-2 text-sm text-mark-med">
              {n}
            </p>
          ))}
        </div>

        <details className="panel p-4" open={colors.length > 0}>
          <summary className="cursor-pointer font-medium">Design colours (optional)</summary>
          <p className="mb-3 mt-1 text-sm muted">
            Add text and background colours used in the creative. BrandGuard checks contrast (WCAG 2.2, 1.4.3) and whether they are in the brand palette.
          </p>
          <ColorPairs pairs={colors} onChange={setColors} />
        </details>

        <ErrorNote error={error} />

        <div className="flex flex-wrap items-center gap-4">
          <button className="btn-primary px-5 py-2.5" disabled={!!busy}>
            {busy === 'check' ? 'Checking…' : 'Check draft'}
          </button>
          {busy === 'check' && (
            <p className="text-sm muted" aria-live="polite">
              {stages[stage]}…
            </p>
          )}
        </div>
      </form>

      <aside>
        <div className="panel p-5">
          <h2 className="font-semibold">Load a sample draft</h2>
          <p className="mt-1 text-sm muted">Realistic PayNova drafts that exercise different checks.</p>
          <div className="mt-4 space-y-3">
            {SAMPLES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => loadSample(s.key)}
                className="w-full rounded-md border border-rule bg-white p-3 text-left hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F5F92]"
              >
                <span className="block text-sm font-semibold">{s.label}</span>
                <span className="mt-0.5 block text-sm muted">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
