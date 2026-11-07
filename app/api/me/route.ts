import { dbMode, query } from '@/lib/db';
import { currentUser, handler } from '@/lib/session';
import { llmConfig } from '@/lib/llm';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = handler(async () => {
  const user = await currentUser();
  const users = await query("SELECT id, name, title, role FROM users ORDER BY CASE role WHEN 'creator' THEN 0 WHEN 'reviewer' THEN 1 ELSE 2 END");
  const cfg = llmConfig();
  return Response.json({ user, users, ai: { provider: cfg.provider, model: cfg.model, embeddings: cfg.embeddings, endpoint: cfg.endpoint }, db: dbMode() });
});
