'use client';
import { createContext, useContext, type ReactNode } from 'react';

export interface Me {
  user: { id: string; name: string; title: string; role: 'creator' | 'reviewer' | 'admin'; workspace_id: string } | null;
  users: { id: string; name: string; title: string; role: string }[];
  ai: { provider: 'openai' | 'anthropic' | 'none'; model: string; embeddings: boolean; endpoint: string };
  db: 'postgres' | 'embedded';
}

export const MeContext = createContext<{ me: Me | null; refresh: () => Promise<void> }>({ me: null, refresh: async () => {} });
export const useMe = () => useContext(MeContext);

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { 'Content-Type': 'application/json', ...(init?.headers || {}) } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-[#EEF1F4] text-graphite' },
  UNDER_REVIEW: { label: 'In review', cls: 'bg-[#E3ECF6] text-mark-low' },
  CHANGES_REQUESTED: { label: 'Changes requested', cls: 'bg-[#F6EBD6] text-mark-med' },
  APPROVED: { label: 'Approved', cls: 'bg-[#E1EFE6] text-mark-ok' },
  REJECTED: { label: 'Rejected', cls: 'bg-[#F8E3DF] text-mark-high' },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] || STATUS.DRAFT;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

const SEV: Record<string, { label: string; dot: string; text: string }> = {
  high: { label: 'High', dot: 'bg-mark-high', text: 'text-mark-high' },
  medium: { label: 'Medium', dot: 'bg-mark-med', text: 'text-mark-med' },
  low: { label: 'Low', dot: 'bg-mark-low', text: 'text-mark-low' },
  info: { label: 'Supported', dot: 'bg-mark-ok', text: 'text-mark-ok' },
};

export function Severity({ severity }: { severity: string }) {
  const s = SEV[severity] || SEV.low;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${s.text}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

export const VERDICT_LABEL: Record<string, string> = {
  contradicted: 'Contradicts a source',
  insufficient: 'Insufficient evidence',
  supported: 'Supported',
  rule: 'Guideline',
};

export const CATEGORY_LABEL: Record<string, string> = {
  claim: 'Claim',
  terminology: 'Terminology',
  tone: 'Tone',
  visual: 'Visual',
  accessibility: 'Accessibility',
  security: 'Security',
};

export const ROLE_LABEL: Record<string, string> = { creator: 'Creator', reviewer: 'Reviewer', admin: 'Admin' };

export function fmtTime(s: string) {
  const d = new Date(s);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md border border-[#E3B3AB] bg-[#FBF1EF] px-3 py-2 text-sm text-mark-high">
      {error}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-rule bg-sheet px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm muted">{children}</div>}
    </div>
  );
}
