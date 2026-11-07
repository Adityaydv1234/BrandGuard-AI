// Database access. Uses a real Postgres when DATABASE_URL is set, otherwise an embedded
// PGlite (Postgres compiled to WASM) so the app runs with zero setup for local development.
import type { Pool } from 'pg';

type Row = Record<string, any>;
interface Driver {
  query(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
  exec(text: string): Promise<unknown>;
}

const g = globalThis as unknown as { __bgDriver?: Promise<Driver>; __bgReady?: Promise<void> };

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import('pg');
    const pool: Pool = new Pool({
      connectionString: url,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
      max: 3,
    });
    return {
      query: async (text, params) => {
        const r = await pool.query(text, params as any[]);
        return { rows: r.rows };
      },
      exec: (text) => pool.query(text),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.VERCEL ? undefined : './.pglite';
  const db = dir ? new PGlite(dir) : new PGlite();
  await db.waitReady;
  return {
    query: async (text, params) => {
      const r = await db.query(text, params as any[]);
      return { rows: r.rows as Row[] };
    },
    exec: (text) => db.exec(text),
  };
}

export function dbMode(): 'postgres' | 'embedded' {
  return process.env.DATABASE_URL ? 'postgres' : 'embedded';
}

async function driver(): Promise<Driver> {
  if (!g.__bgDriver) g.__bgDriver = createDriver();
  return g.__bgDriver;
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  const d = await driver();
  const r = await d.query(text, params);
  return r.rows as T[];
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, palette JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL,
  title TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('creator','reviewer','admin'))
);
CREATE TABLE IF NOT EXISTS sources (
  id SERIAL PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL,
  kind TEXT NOT NULL, version TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('approved','draft','obsolete')),
  owner TEXT NOT NULL, effective_date DATE NOT NULL, body TEXT NOT NULL, file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chunks (
  id SERIAL PRIMARY KEY, source_id INT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL, ref TEXT NOT NULL, text TEXT NOT NULL, embedding JSONB
);
CREATE TABLE IF NOT EXISTS terms (
  id SERIAL PRIMARY KEY, workspace_id TEXT NOT NULL, banned TEXT NOT NULL, preferred TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '', severity TEXT NOT NULL DEFAULT 'medium', source_id INT, ref TEXT
);
CREATE TABLE IF NOT EXISTS rules (
  id SERIAL PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
  pattern TEXT NOT NULL, verdict TEXT NOT NULL DEFAULT 'rule', severity TEXT NOT NULL,
  message TEXT NOT NULL, suggestion TEXT, source_id INT, ref TEXT, active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL, channel TEXT NOT NULL,
  creator_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, current_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS versions (
  id SERIAL PRIMARY KEY, submission_id INT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  number INT NOT NULL, content TEXT NOT NULL, colors JSONB NOT NULL DEFAULT '[]', hash TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), policy_snapshot JSONB,
  analysis JSONB, UNIQUE (submission_id, number)
);
CREATE TABLE IF NOT EXISTS findings (
  id SERIAL PRIMARY KEY, version_id INT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  submission_id INT NOT NULL, workspace_id TEXT NOT NULL, category TEXT NOT NULL, verdict TEXT NOT NULL,
  severity TEXT NOT NULL, span_text TEXT, span_start INT, span_end INT, title TEXT NOT NULL,
  rationale TEXT NOT NULL, suggestion TEXT, evidence JSONB NOT NULL DEFAULT '[]', engine TEXT NOT NULL,
  rule_key TEXT, resolution TEXT NOT NULL DEFAULT 'open', resolution_note TEXT, resolved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY, submission_id INT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  version_number INT NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS decisions (
  id SERIAL PRIMARY KEY, submission_id INT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  version_number INT NOT NULL, hash TEXT NOT NULL, reviewer_id TEXT NOT NULL, decision TEXT NOT NULL,
  reason TEXT, override BOOLEAN NOT NULL DEFAULT false, valid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit (
  id SERIAL PRIMARY KEY, workspace_id TEXT NOT NULL, submission_id INT, actor_id TEXT NOT NULL,
  action TEXT NOT NULL, detail JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_findings_sub ON findings(submission_id);
CREATE INDEX IF NOT EXISTS idx_chunks_ws ON chunks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_sub ON audit(submission_id);
`;

async function migrateAndSeed() {
  const d = await driver();
  await d.exec(SCHEMA);
  const { seed } = await import('./seed');
  await seed({
    query: async (t: string, p: unknown[] = []) => (await d.query(t, p)).rows,
  });
}

export function ready(): Promise<void> {
  if (!g.__bgReady) {
    g.__bgReady = migrateAndSeed().catch((e) => {
      g.__bgReady = undefined;
      throw e;
    });
  }
  return g.__bgReady;
}
