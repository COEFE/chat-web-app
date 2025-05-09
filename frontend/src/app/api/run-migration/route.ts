import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { userId, error } = await authenticateRequest(req);
    if (error) return error;
    
    // Only allow specific users or in development environment
    if (process.env.NODE_ENV !== 'development' && process.env.ADMIN_USERS?.split(',').indexOf(userId) === -1) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // Get the migration file from request
    const body = await req.json();
    const { filename } = body;
    
    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }
    
    // Validate filename to prevent directory traversal
    if (!/^[a-zA-Z0-9_\-\.]+\.sql$/.test(filename)) {
      return NextResponse.json({ error: 'Invalid filename format' }, { status: 400 });
    }
    
    // Construct path to migration file
    const migrationsDir = path.join(process.cwd(), 'src', 'app', 'api', 'db-migrations');
    const filePath = path.join(migrationsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: `Migration file not found: ${filename}` }, { status: 404 });
    }
    
    // Read and execute the SQL file
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    
    try {
      // Split SQL into statements while respecting dollar-quoted blocks (e.g. $$ ... $$)
      function splitSql(sqlText: string): string[] {
        const stmts: string[] = [];
        let current = '';
        let i = 0;
        let inDollar = false;
        let dollarTag = '';
        const len = sqlText.length;
        while (i < len) {
          // Detect start of dollar-quote when not already inside
          if (!inDollar && sqlText[i] === '$') {
            const tagMatch = sqlText.slice(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
            if (tagMatch) {
              dollarTag = tagMatch[1];
              inDollar = true;
              current += dollarTag;
              i += dollarTag.length;
              continue;
            }
          }
          // Detect end of dollar-quote
          if (inDollar && sqlText.startsWith(dollarTag, i)) {
            current += dollarTag;
            i += dollarTag.length;
            inDollar = false;
            continue;
          }
          const ch = sqlText[i];
          if (!inDollar && ch === ';') {
            // End of statement
            if (current.trim()) {
              stmts.push(current.trim());
            }
            current = '';
            i++;
            continue;
          }
          current += ch;
          i++;
        }
        if (current.trim()) stmts.push(current.trim());
        return stmts;
      }

      const statements = splitSql(sqlContent);
      
      // Execute each statement individually (Vercel Postgres opens a fresh connection per query)
      for (const statement of statements) {
        try {
          await sql.query(statement);
        } catch (stmtErr: any) {
          const duplicateCodes = new Set([
            '42710', // duplicate_object (trigger/view etc.)
            '42701', // duplicate_column
            '42P07', // duplicate_table
            '42723', // duplicate_function
            '42704', // undefined object, safe to ignore for DROP statements
          ]);
          const errCode = stmtErr?.code as string | undefined;
          if (errCode && duplicateCodes.has(errCode)) {
            // Log and continue so migrations are idempotent
            console.warn(`Skipping duplicate object error (code ${errCode}) while executing:`, statement);
            continue;
          }
          console.error('Migration statement failed:', statement, stmtErr);
          throw stmtErr;
        }
      }
      
      // Record the migration in a migrations table (create if not exists)
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
      `;
      
      return NextResponse.json({ 
        success: true, 
        message: `Migration ${filename} applied successfully`
      });
    } catch (err) {
      console.error('Error applying migration:', err);
      return NextResponse.json({ 
        error: 'Failed to apply migration', 
        details: err instanceof Error ? err.message : String(err)
      }, { status: 500 });
    }
  } catch (err) {
    console.error('Error applying migration:', err);
    return NextResponse.json({ 
      error: 'Failed to apply migration', 
      details: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
}
