const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Function to send a test email
async function sendTestEmail() {
  try {
    // This is the EXACT structure required by the Firebase Email Extension
    const emailDoc = {
      // Recipient information (MUST be an array)
      to: ['chris.ealy@gmail.com'],
      
      // Message fields at the top level
      message: {
        subject: 'Test Email from Script',
        text: 'This is a test email sent directly using the Firebase Admin SDK.',
        html: '<p>This is a <strong>test email</strong> sent directly using the Firebase Admin SDK.</p>'
      },
      
      // Empty attachments array (REQUIRED by the extension)
      attachments: [],
      
      // Metadata
      createdAt: new Date(),
    };
    
    console.log('Sending test email with structure:', JSON.stringify(emailDoc, null, 2));
    
    // Add the email document to the collection
    // Note the collection name with the typo: 'emai_shares'
    const result = await db.collection('emai_shares').add(emailDoc);
    
    console.log('Email document created with ID:', result.id);
    console.log('Check Firebase console for delivery status.');
    
  } catch (error) {
    console.error('Error sending test email:', error);
  }
}

// Run the function
sendTestEmail();
