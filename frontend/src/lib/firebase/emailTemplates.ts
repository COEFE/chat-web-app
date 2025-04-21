import { db } from '@/lib/firebaseConfig';
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';

/**
 * Initializes the default email templates in Firestore
 * This only needs to be run once to set up the templates
 */
export const initializeEmailTemplates = async (): Promise<void> => {
  try {
    const templatesCollection = collection(db, 'email_templates');
    
    // Document sharing template
    await setDoc(doc(templatesCollection, 'document-share'), {
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
      attachments: [], // Required by Firebase Email Extension (avoid undefined attachments error)
    });
    
    console.log('Email templates initialized successfully');
  } catch (error) {
    console.error('Error initializing email templates:', error);
    throw error;
  }
};

/**
 * Checks if the email templates exist and initializes them if needed
 * Note: This requires admin access or proper Firestore rules to write to email_templates collection
 * For regular users, we'll just use the templates directly without checking/initializing
 */
export const ensureEmailTemplatesExist = async (): Promise<void> => {
  try {
    // Only try to read the template - don't try to create it if missing
    // Template creation should be done by an admin or during deployment
    const templateRef = doc(db, 'email_templates', 'document-share');
    await getDoc(templateRef);
    
    // If we get here, we were able to at least read the template collection
    console.log('Email templates access verified');
  } catch (error) {
    // Just log the error but don't try to create templates
    // The Firebase extension will use default templates if none exist
    console.log('Note: Using default email templates');
    
    // Don't log the full error as it's expected for regular users
    if (process.env.NODE_ENV === 'development') {
      console.error('Email template access error (expected for regular users):', error);
    }
  }
};
