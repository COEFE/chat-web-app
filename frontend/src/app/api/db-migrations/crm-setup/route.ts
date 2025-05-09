import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getServerSession } from "next-auth";
import { getAuth } from "@/lib/firebaseAdmin";
import { executeQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Verify Firebase ID token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const token = authHeader.split('Bearer ')[1];
    const auth = getAuth();
    await auth.verifyIdToken(token);
    
    // Read migration file
    const filePath = path.join(process.cwd(), 'src', 'app', 'api', 'db-migrations', 'crm-setup.sql');
    const sqlScript = fs.readFileSync(filePath, 'utf8');
    
    // Execute SQL script
    await executeQuery(sqlScript);
    
    return new NextResponse(
      JSON.stringify({ success: true, message: 'CRM database setup completed successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in CRM setup migration:', error);
    return new NextResponse(
      JSON.stringify({ error: error.message || 'An error occurred during CRM setup' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
