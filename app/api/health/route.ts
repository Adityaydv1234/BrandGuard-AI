import { dbMode, query } from '@/lib/db';
import { llmConfig } from '@/lib/llm';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    await query('SELECT 1');
    const c = llmConfig();
    return Response.json({ ok: true, db: dbMode(), ai: c.provider, model: c.model });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
