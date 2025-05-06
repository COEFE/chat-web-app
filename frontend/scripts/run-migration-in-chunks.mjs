// run-migration-in-chunks.mjs
import { createPool } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the migration file name from command line arguments
const migrationFile = process.argv[2];
const connectionString = process.env.POSTGRES_URL;

if (!migrationFile) {
  console.error('Error: Migration file name is required');
  console.error('Usage: node run-migration-in-chunks.mjs <migration-file-name>');
  process.exit(1);
}

// Ensure the file has .sql extension
if (!migrationFile.endsWith('.sql')) {
  console.error('Error: Migration file must have .sql extension');
  process.exit(1);
}

// Check if we have a connection string
if (!connectionString) {
  console.error('Error: POSTGRES_URL environment variable is required');
  console.error('Make sure it is set in .env.local');
  process.exit(1);
}

// Get the full path to the migration file
const migrationsDir = path.join(__dirname, '..', 'src', 'app', 'api', 'db-migrations');
const migrationPath = path.join(migrationsDir, migrationFile);

// Check if the file exists
if (!fs.existsSync(migrationPath)) {
  console.error(`Error: Migration file ${migrationFile} not found at ${migrationPath}`);
  process.exit(1);
}

// Read the migration file
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
console.log(`Loaded migration from ${migrationPath}`);

// Split the SQL into chunks - first create the function, then run account inserts in groups
const chunks = [
  // First chunk - create the upsert_account function
  migrationSql.substring(0, migrationSql.indexOf("-- ASSETS (1000-1999)")),
  
  // Second chunk - ASSETS
  migrationSql.substring(
    migrationSql.indexOf("-- ASSETS (1000-1999)"),
    migrationSql.indexOf("-- LIABILITIES (2000-2999)")
  ),
  
  // Third chunk - LIABILITIES
  migrationSql.substring(
    migrationSql.indexOf("-- LIABILITIES (2000-2999)"),
    migrationSql.indexOf("-- EQUITY (3000-3999)")
  ),
  
  // Fourth chunk - EQUITY
  migrationSql.substring(
    migrationSql.indexOf("-- EQUITY (3000-3999)"),
    migrationSql.indexOf("-- REVENUE (4000-4999)")
  ),
  
  // Fifth chunk - REVENUE
  migrationSql.substring(
    migrationSql.indexOf("-- REVENUE (4000-4999)"),
    migrationSql.indexOf("-- COST OF GOODS SOLD (5000-5999)")
  ),
  
  // Sixth chunk - COST OF GOODS SOLD
  migrationSql.substring(
    migrationSql.indexOf("-- COST OF GOODS SOLD (5000-5999)"),
    migrationSql.indexOf("-- OPERATING EXPENSES (6000-6999)")
  ),
  
  // Seventh chunk - OPERATING EXPENSES
  migrationSql.substring(
    migrationSql.indexOf("-- OPERATING EXPENSES (6000-6999)"),
    migrationSql.indexOf("-- Drop the function when done")
  ),
  
  // Eighth chunk - Drop the function
  migrationSql.substring(
    migrationSql.indexOf("-- Drop the function when done"),
    migrationSql.length
  )
];

async function runMigration() {
  // Create a database connection with the provided connection string
  const pool = createPool({ connectionString });
  
  try {
    console.log('Executing migration in chunks...');
    
    // Execute each chunk sequentially
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i].trim();
      if (chunk) {
        console.log(`Executing chunk ${i + 1} of ${chunks.length}...`);
        await pool.query(chunk);
        console.log(`Chunk ${i + 1} executed successfully.`);
      }
    }
    
    console.log(`Migration ${migrationFile} executed successfully!`);
  } catch (err) {
    console.error(`Error executing migration chunk:`, err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the migration
runMigration();
