// frontend/src/app/api/statements/embeddings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { 
  findSimilarStatements, 
  getStatementsForAccount,
  ensureStatementEmbeddingsTable 
} from '@/lib/statementEmbeddings';

/**
 * GET endpoint to search for similar statements or get statements for an account
 */
export async function GET(request: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(request);
  if (error) return error;

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Ensure the table exists
    await ensureStatementEmbeddingsTable();

    const { searchParams } = new URL(request.url);
    const searchText = searchParams.get('search');
    const accountNumber = searchParams.get('account');
    const limit = parseInt(searchParams.get('limit') || '5');

    if (searchText) {
      // Search for similar statements
      console.log(`[API] Searching for statements similar to: "${searchText}"`);
      const similarStatements = await findSimilarStatements(searchText, userId, limit);
      
      return NextResponse.json({
        success: true,
        statements: similarStatements,
        searchText,
        count: similarStatements.length
      });
    } else if (accountNumber) {
      // Get all statements for a specific account
      console.log(`[API] Getting statements for account: ${accountNumber}`);
      const statements = await getStatementsForAccount(userId, accountNumber);
      
      return NextResponse.json({
        success: true,
        statements,
        accountNumber,
        count: statements.length
      });
    } else {
      return NextResponse.json(
        { error: 'Either search text or account number is required' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[API] Error in statements embeddings endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint to manually trigger embedding creation for existing statements
 */
export async function POST(request: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(request);
  if (error) return error;

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { regenerateAll = false } = body;

    // Ensure the table exists
    await ensureStatementEmbeddingsTable();

    if (regenerateAll) {
      // This would be a more complex operation to regenerate embeddings
      // for existing statements from the statement_trackers table
      return NextResponse.json({
        success: true,
        message: 'Regenerate all embeddings feature not yet implemented'
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Statement embeddings table ensured'
    });
  } catch (error) {
    console.error('[API] Error in statements embeddings POST endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
