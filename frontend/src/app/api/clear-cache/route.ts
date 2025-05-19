import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pdfFileName, userId } = body;
    
    if (!pdfFileName || !userId) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters: pdfFileName and userId' },
        { status: 400 }
      );
    }
    
    // Check if the table exists
    const { rows: tableExists } = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'statement_extractions'
      );
    `;
    
    if (!tableExists[0].exists) {
      return NextResponse.json(
        { success: false, message: "Cache table doesn't exist yet, nothing to clear." },
        { status: 200 }
      );
    }
    
    // Delete the cache entries
    await sql`
      DELETE FROM statement_extractions
      WHERE pdf_filename = ${pdfFileName}
      AND user_id = ${userId}
    `;
    
    return NextResponse.json({
      success: true,
      message: `Cleared extraction cache for PDF: ${pdfFileName}`
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return NextResponse.json(
      { success: false, message: `Error clearing cache: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
