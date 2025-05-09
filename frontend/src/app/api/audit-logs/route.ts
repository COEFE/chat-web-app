import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { getAuditLogs } from '@/lib/auditLogger';

// GET /api/audit-logs
// Returns paginated audit logs based on optional query parameters.
export async function GET(req: NextRequest) {
  // Require authentication (adjust logic if you have role checks)
  const { error } = await authenticateRequest(req);
  if (error) return error;

  const q = new URL(req.url).searchParams;
  const page = parseInt(q.get('page') || '1', 10);
  const limit = parseInt(q.get('limit') || '50', 10);

  try {
    const data = await getAuditLogs({
      userId: q.get('userId') || undefined,
      actionType: q.get('actionType') || undefined,
      entityType: q.get('entityType') || undefined,
      entityId: q.get('entityId') || undefined,
      startDate: q.get('startDate') || undefined,
      endDate: q.get('endDate') || undefined,
      status: q.get('status') || undefined,
      page,
      limit,
    });

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error('[api/audit-logs] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch audit logs' }, { status: 500 });
  }
}
