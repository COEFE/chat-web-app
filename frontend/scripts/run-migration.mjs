// run-migration.mjs
// Simple script to run a SQL migration file directly using the Vercel Postgres client
import { createPool } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the migration file name from command line arguments
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Error: Migration file name is required');
  console.error('Usage: node run-migration.mjs <migration-file-name>');
  process.exit(1);
}

// Ensure the file has .sql extension
if (!migrationFile.endsWith('.sql')) {
  console.error('Error: Migration file must have .sql extension');
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

async function runMigration() {
  // Create a database connection
  const pool = createPool();
  
  try {
    console.log('Executing migration...');
    await pool.query(migrationSql);
    console.log(`Migration ${migrationFile} executed successfully!`);
  } catch (err) {
    console.error('Error executing migration:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the migration
runMigration();
