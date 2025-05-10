#!/usr/bin/env node

/**
 * Simple command-line script to run database migrations
 */

console.log('Database Migration Utility');
console.log('==========================');

// Check if TypeScript is already compiled
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const tsFilePath = path.join(__dirname, 'run-migrations.ts');
const jsFilePath = path.join(__dirname, 'run-migrations.js');

// Check if we need to compile TypeScript
if (!fs.existsSync(jsFilePath) || 
    fs.statSync(tsFilePath).mtime > fs.statSync(jsFilePath).mtime) {
  console.log('Compiling TypeScript...');
  try {
    execSync('npx tsc --esModuleInterop --resolveJsonModule src/admin/database/run-migrations.ts', {
      cwd: path.join(__dirname, '../../../'),
      stdio: 'inherit'
    });
  } catch (error) {
    console.error('Failed to compile TypeScript:', error.message);
    process.exit(1);
  }
}

// Run the migrations
console.log('Running migrations...');
try {
  // Import the compiled JavaScript file
  const { runMigrations } = require('./run-migrations');
  
  // Run migrations
  runMigrations()
    .then(() => {
      console.log('Migration process completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration process failed:', error);
      process.exit(1);
    });
} catch (error) {
  console.error('Failed to run migrations:', error.message);
  process.exit(1);
}
