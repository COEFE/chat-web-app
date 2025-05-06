import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getAuth } from "firebase-admin/auth";
import { initializeFirebaseAdmin } from "@/lib/firebaseAdminConfig";
import fs from "fs";
import path from "path";

// Initialize Firebase Admin if not already initialized
initializeFirebaseAdmin();

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized: Missing or invalid Authorization header" }, { status: 401 });
    }
    
    const token = authHeader.split("Bearer ")[1];
    let userId;
    
    try {
      const decodedToken = await getAuth().verifyIdToken(token);
      userId = decodedToken.uid;
    } catch (authError) {
      console.error("[journals/migrations] Auth error:", authError);
      return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
    }
    
    // Get migration details from request
    const requestData = await req.json().catch(() => ({}));
    const { migrationName, skipMigrations } = requestData;
    
    // Get the directory path for migrations
    const migrationsDir = path.join(process.cwd(), 'src', 'app', 'api', 'journals', 'migrations');
    
    // Read all SQL files in the migrations directory
    let migrationFiles: string[] = [];
    try {
      migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort(); // Sort to ensure migrations run in order
      
      // Filter based on migrationName if provided
      if (migrationName) {
        migrationFiles = migrationFiles.filter(file => file.includes(migrationName));
      }
      
      // Filter out skipped migrations if provided
      if (skipMigrations && Array.isArray(skipMigrations) && skipMigrations.length > 0) {
        migrationFiles = migrationFiles.filter(file => {
          return !skipMigrations.some(skipPattern => file.includes(skipPattern));
        });
      }
      
      if (migrationFiles.length === 0) {
        return NextResponse.json({ 
          message: migrationName 
            ? `No migration found matching: ${migrationName}` 
            : "No migration files found" 
        });
      }
      
      console.log(`[journals/migrations] Preparing to run migrations: ${migrationFiles.join(', ')}`);
    } catch (err) {
      console.error("[journals/migrations] Error reading migrations directory:", err);
      return NextResponse.json({ error: "Failed to read migrations directory" }, { status: 500 });
    }
    
    // Run each migration file
    const results = [];
    for (const file of migrationFiles) {
      try {
        console.log(`[journals/migrations] Running migration: ${file}`);
        const filePath = path.join(migrationsDir, file);
        const sqlContent = fs.readFileSync(filePath, 'utf8');
        
        // Execute the SQL migration
        await sql.query(sqlContent);
        
        results.push({ file, status: "success" });
      } catch (err: any) {
        console.error(`[journals/migrations] Error running migration ${file}:`, err);
        results.push({ 
          file, 
          status: "error", 
          message: err.message || "Unknown error" 
        });
        
        // Don't continue with further migrations if one fails
        break;
      }
    }
    
    return NextResponse.json({ 
      success: results.every(r => r.status === "success"),
      results 
    });
  } catch (err: any) {
    console.error('[journals/migrations] Error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
