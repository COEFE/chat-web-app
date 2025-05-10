import * as fs from 'fs';
import * as path from 'path';
import * as sql from '../lib/db';

/**
 * Simple migration runner to execute SQL migration files
 */
async function runMigrations() {
  // Create migrations table if it doesn't exist
  await sql.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Get list of migrations that have been applied
  const appliedResult = await sql.query('SELECT name FROM migrations ORDER BY name');
  const appliedMigrations = new Set(appliedResult.rows.map((row: any) => row.name));

  // Get all migration files
  const migrationsDir = path.join(process.cwd(), 'src', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort to ensure migrations run in the correct order

  // Run migrations that haven't been applied yet
  console.log('Running migrations...');
  for (const file of migrationFiles) {
    if (!appliedMigrations.has(file)) {
      console.log(`Applying migration: ${file}`);
      try {
        // Read and execute the SQL file
        const filePath = path.join(migrationsDir, file);
        const sqlContent = fs.readFileSync(filePath, 'utf8');
        
        // Begin transaction
        await sql.query('BEGIN');
        
        try {
          // Execute the SQL
          await sql.query(sqlContent);
          
          // Record that we've applied this migration
          await sql.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
          
          // Commit the transaction
          await sql.query('COMMIT');
          console.log(`Successfully applied migration: ${file}`);
        } catch (error) {
          // If there's an error, roll back the transaction
          await sql.query('ROLLBACK');
          console.error(`Error applying migration ${file}:`, error);
          throw error;
        }
      } catch (error) {
        console.error(`Failed to apply migration ${file}:`, error);
        process.exit(1);
      }
    } else {
      console.log(`Migration already applied: ${file}`);
    }
  }

  console.log('All migrations completed successfully!');
}

// Execute the migration runner
runMigrations()
  .then(() => {
    console.log('Migration process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration process failed:', error);
    process.exit(1);
  });
