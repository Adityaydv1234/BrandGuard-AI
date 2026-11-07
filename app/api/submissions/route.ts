import { query } from '@/lib/db';
import { handler, requireUser } from '@/lib/session';
import { createSubmission } from '@/lib/workflow';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = handler(async () => {
  const u = await requireUser();
  const rows = await query(
    `SELECT s.id, s.title, s.channel, s.status, s.current_version, s.created_at, s.updated_at, u.name AS creator_name, s.creator_id,
            (SELECT COUNT(*)::int FROM findings f JOIN versions v ON v.id=f.version_id
              WHERE v.submission_id=s.id AND v.number=s.current_version AND f.verdict<>'supported' AND f.resolution IN ('open','disputed','upheld')) AS open_findings,
            (SELECT COUNT(*)::int FROM findings f JOIN versions v ON v.id=f.version_id
              WHERE v.submission_id=s.id AND v.number=s.current_version AND f.severity='high' AND f.verdict<>'supported' AND f.resolution IN ('open','disputed','upheld')) AS high_findings
       FROM submissions s JOIN users u ON u.id=s.creator_id
      WHERE s.workspace_id=$1 ORDER BY s.updated_at DESC, s.id DESC`,
    [u.workspace_id]
  );
  return Response.json({ submissions: rows });
});

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const id = await createSubmission(u, await req.json());
  return Response.json({ id });
});
