import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';

/**
 * API Route: /api/setup-audit-logs
 * Sets up the audit logs table by running the 026_create_audit_logs_table.sql migration
 * This is a simplified version of the run-migration API specifically for audit logs
 */
export async function POST(req: NextRequest) {
  try {
    let userId = 'dev-user';
    
    // In production, verify authentication
    if (process.env.NODE_ENV !== 'development') {
      const authResult = await authenticateRequest(req);
      if (authResult.error) return authResult.error;
      userId = authResult.userId || 'unknown';
      
      // Only allow admin users in production
      if (process.env.ADMIN_USERS?.split(',').indexOf(userId) === -1) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    } else {
      console.log('[SetupAuditLogs] Running in development mode with bypassed authentication');
    }
    
    // Construct path to migration file
    const migrationsDir = path.join(process.cwd(), 'src', 'app', 'api', 'db-migrations');
    const filename = '026_create_audit_logs_table.sql';
    const filePath = path.join(migrationsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: `Migration file not found: ${filename}` }, { status: 404 });
    }
    
    // Read and execute the SQL file
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    
    // Execute the SQL directly
    await sql.query(sqlContent);
    
    // Record the migration in the migrations table
    await sql`
      CREATE TABLE IF NOT EXISTS db_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        applied_by VARCHAR(255)
      )
    `;
    
    await sql`
      INSERT INTO db_migrations (filename, applied_by)
      VALUES (${filename}, ${userId})
      ON CONFLICT DO NOTHING
    `;
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully executed migration: ${filename}` 
    });
  } catch (error: any) {
    console.error('Error in setup-audit-logs API:', error);
    return NextResponse.json({ 
      error: error.message || 'Unknown error occurred',
      details: error
    }, { status: 500 });
  }
}
