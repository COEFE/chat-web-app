// Script to run the journal line fields migration
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../frontend/.env.local') });

// Import Firebase Admin directly
const admin = require('firebase-admin');

// Path to your service account credentials file
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.resolve(__dirname, '../serviceAccountKey.json');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    let serviceAccount;
    
    if (fs.existsSync(serviceAccountPath)) {
      serviceAccount = require(serviceAccountPath);
    } else {
      // Try to parse from environment variable
      try {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY
          ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
          : undefined;
          
        serviceAccount = {
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        };
      } catch (parseError) {
        console.error('Failed to parse Firebase credentials from environment variables:', parseError);
        process.exit(1);
      }
    }
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
    
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    process.exit(1);
  }
}

// Create a custom token for a test user or use a specific user ID
async function createTestToken() {
  try {
    // Use a test user ID or the first user in your Firebase Auth
    // You might need to replace this with a valid user ID from your system
    const userId = process.env.TEST_USER_ID || 'test-user-for-migration';
    const customToken = await admin.auth().createCustomToken(userId);
    return customToken;
  } catch (error) {
    console.error('Error creating custom token:', error);
    throw error;
  }
}

// Run the migration
async function runMigration() {
  try {
    // Create a custom token
    const token = await createTestToken();
    console.log('Generated token for testing');
    
    // Execute SQL directly with postgres client
    const { Client } = require('pg');
    
    // Create a database client using environment variables
    const client = new Client({
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.POSTGRES_URL?.includes('sslmode=require') 
           ? { rejectUnauthorized: false } 
           : undefined,
    });
    
    // Connect to the database
    await client.connect();
    console.log('Connected to the database');
    
    try {
      // Read the migration SQL
      const migrationSql = fs.readFileSync(
        path.resolve(__dirname, '../frontend/src/app/api/db-migrations/add-journal-line-fields.sql'),
        'utf8'
      );
      
      // Execute the migration SQL
      await client.query(migrationSql);
      console.log('Migration executed successfully');
      
      // Verify the columns were added
      const { rows } = await client.query(`
        SELECT 
          column_name 
        FROM 
          information_schema.columns 
        WHERE 
          table_name = 'journal_lines' AND 
          column_name IN ('category', 'location', 'vendor', 'funder')
      `);
      
      console.log('Added columns:', rows.map(r => r.column_name));
    } finally {
      // Always close the database connection
      await client.end();
      console.log('Database connection closed');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the script
runMigration().then(() => {
  console.log('Migration process completed');
}).catch(err => {
  console.error('Error in migration process:', err);
  process.exit(1);
});
