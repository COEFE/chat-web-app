import { NextResponse } from 'next/server';
import { checkDatabaseStructure } from '@/lib/dbChecker';

export async function GET() {
  try {
    const result = await checkDatabaseStructure();
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in db-check endpoint:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }, 
      { status: 500 }
    );
  }
}
