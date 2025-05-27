import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';

export async function POST(req: NextRequest) {
  try {
    const { userId, error } = await authenticateRequest(req);
    if (error) return error;

    console.log('[migrate-bill-attachments] Running bill_attachments table migration...');

    // Create bill_attachments table
    await sql`
      CREATE TABLE IF NOT EXISTS bill_attachments (
          id SERIAL PRIMARY KEY,
          bill_id INTEGER NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          file_url TEXT NOT NULL,
          file_path TEXT,
          file_type VARCHAR(100),
          file_size INTEGER,
          uploaded_by VARCHAR(255),
          uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Add indexes for better performance
    await sql`CREATE INDEX IF NOT EXISTS idx_bill_attachments_bill_id ON bill_attachments(bill_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_bill_attachments_uploaded_by ON bill_attachments(uploaded_by)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_bill_attachments_uploaded_at ON bill_attachments(uploaded_at)`;

    console.log('[migrate-bill-attachments] Migration completed successfully');

    return NextResponse.json({
      success: true,
      message: 'Bill attachments table created successfully'
    });

  } catch (error: any) {
    console.error('[migrate-bill-attachments] Migration failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
