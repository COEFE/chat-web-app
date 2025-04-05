// This script helps prepare environment variables for Vercel deployment
// It properly formats the Firebase Admin private key for Vercel

const fs = require('fs');
const path = require('path');

// Check if the service account key file exists
const serviceAccountPath = path.join(__dirname, 'firebase-admin-key.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('Service account key file not found. Please generate it first:');
  console.error('gcloud iam service-accounts keys create firebase-admin-key.json --iam-account=firebase-adminsdk-fbsvc@web-chat-app-fa7f0.iam.gserviceaccount.com');
  process.exit(1);
}

// Read the service account key file
const serviceAccount = require(serviceAccountPath);

// Format the private key for Vercel
// Vercel requires the private key to be properly escaped
const privateKey = serviceAccount.private_key;
const vercelFormattedKey = JSON.stringify(privateKey);

console.log('\n=== Vercel Environment Variables ===\n');
console.log(`FIREBASE_PROJECT_ID=${serviceAccount.project_id}`);
console.log(`FIREBASE_CLIENT_EMAIL=${serviceAccount.client_email}`);
console.log(`FIREBASE_PRIVATE_KEY=${vercelFormattedKey}`);
console.log('\n=== Copy these values to your Vercel project settings ===\n');

// Cleanup instructions
console.log('After copying these values to Vercel, delete the service account key file:');
console.log('rm firebase-admin-key.json');
console.log('\nThen trigger a new deployment in Vercel.');
