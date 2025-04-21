#!/usr/bin/env ts-node

/**
 * One-off script to seed the 'document-share' email template in Firestore.
 * Requires GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON
 */
import admin from 'firebase-admin';

// Initialize the Admin SDK with default credentials
admin.initializeApp();
const db = admin.firestore();

async function seed() {
  const ref = db.collection('email_templates').doc('document-share');
  await ref.set({
    subject: '{{senderName}} shared a document with you: {{documentName}}',
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { border: 1px solid #ddd; border-radius: 5px; padding: 20px; }
    .header { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
    .footer { border-top: 1px solid #eee; padding-top: 10px; margin-top: 20px; font-size: 12px; color: #777; }
    .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; }
    .note { background-color: #f8f9fa; padding: 10px; margin: 15px 0; border-left: 4px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Document Shared With You</h2>
    </div>
    
    <p>Hello,</p>
    
    <p>{{senderName}} has shared the document <strong>"{{documentName}}"</strong> with you.</p>
    
    <p style="margin: 25px 0; text-align: center;">
      <a href="{{{shareUrl}}}" class="button">View Document</a>
    </p>
    
    {{#if expirationText}}
    <p class="note">
      {{expirationText}}<br>
      {{#if passwordText}}{{passwordText}}<br>{{/if}}
    </p>
    {{/if}}
    
    <div class="footer">
      <p>This is an automated message from Document Sharing Service.</p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
Hello,

{{senderName}} has shared the document "{{documentName}}" with you.

You can access it using this link: {{{shareUrl}}}

{{#if expirationText}}
{{expirationText}}
{{/if}}

{{#if passwordText}}
{{passwordText}}
{{/if}}

Thanks,
Document Sharing Service
    `,
    attachments: [],
  });
  console.log('Email template seeded successfully');
}

seed().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
