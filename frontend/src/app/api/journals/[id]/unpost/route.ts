import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { unpostJournal } from '@/lib/accounting/journalQueries';

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await authenticateRequest(req);
  if (authError) {
    return authError;
  }

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid journal ID' }, { status: 400 });
  }

  if (!userId) {
    // This check is technically redundant if authenticateRequest guarantees userId on no error,
    // but kept for explicitness.
    return NextResponse.json({ error: 'User authentication failed' }, { status: 401 });
  }

  try {
    await unpostJournal(id, userId);
    return NextResponse.json({ success: true, message: 'Journal unposted successfully' });
  } catch (error: any) {
    console.error(`[api/journals/${id}/unpost] POST error:`, error);
    // Provide a more specific error message if available
    const errorMessage = error.message || 'Failed to unpost journal due to an unexpected error.';
    // Determine status code based on specific error messages
    let statusCode = 500; // Default to internal server error
    if (error.message === 'Journal not found or has been deleted.') {
      statusCode = 404;
    } else if (error.message === 'Journal is not currently posted.') {
      statusCode = 400;
    }
    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}
