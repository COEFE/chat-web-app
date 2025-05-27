import { NextRequest, NextResponse } from 'next/server';
import { ensureReceiptEmbeddingsTable } from '@/lib/receiptEmbeddings';

export async function POST(request: NextRequest) {
  try {
    console.log('[Receipts DB Setup] Setting up receipt embeddings table...');
    
    // Ensure the receipt_embeddings table exists
    await ensureReceiptEmbeddingsTable();
    
    console.log('[Receipts DB Setup] Receipt embeddings table setup completed successfully');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Receipt embeddings table setup completed successfully' 
    });
    
  } catch (error) {
    console.error('[Receipts DB Setup] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to setup receipt embeddings table',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}
