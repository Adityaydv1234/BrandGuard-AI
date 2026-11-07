export type Severity = 'high' | 'medium' | 'low' | 'info';
export type Verdict = 'contradicted' | 'insufficient' | 'supported' | 'rule';
export type Category = 'claim' | 'terminology' | 'tone' | 'visual' | 'accessibility' | 'security';
export type Role = 'creator' | 'reviewer' | 'admin';
export type Status = 'DRAFT' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED';

export interface Evidence {
  chunk_id?: number;
  source_id: number;
  title: string;
  version: string;
  ref: string;
  excerpt: string;
}

export interface DraftFinding {
  category: Category;
  verdict: Verdict;
  severity: Severity;
  span_text: string | null;
  span_start: number | null;
  span_end: number | null;
  title: string;
  rationale: string;
  suggestion: string | null;
  evidence: Evidence[];
  engine: 'rule' | 'ai';
  rule_key: string | null;
}

export interface ColorPair {
  label: string;
  fg: string;
  bg: string;
  large?: boolean;
}

export interface EligibleChunk {
  id: number;
  source_id: number;
  title: string;
  version: string;
  kind: string;
  ref: string;
  text: string;
  embedding: number[] | null;
}

export interface Term {
  id: number;
  banned: string;
  preferred: string;
  note: string;
  severity: Severity;
  source_id: number | null;
  ref: string | null;
}

export interface Rule {
  id: number;
  name: string;
  category: Category;
  pattern: string;
  verdict: Verdict;
  severity: Severity;
  message: string;
  suggestion: string | null;
  source_id: number | null;
  ref: string | null;
  active: boolean;
}

export interface PolicyContext {
  workspaceId: string;
  chunks: EligibleChunk[];
  terms: Term[];
  rules: Rule[];
  palette: { name: string; hex: string }[];
  sources: { id: number; title: string; version: string; status: string; kind: string; effective_date: string }[];
}

export interface AnalysisMeta {
  mode: 'full' | 'rules-only';
  provider: string;
  model: string;
  retrieval: 'hybrid' | 'keyword';
  claims_checked: number;
  duration_ms: number;
  warnings: string[];
}
