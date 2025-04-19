# Document and Chat History Sharing Implementation Plan

## Overview

This document outlines the implementation plan for adding document and chat history sharing functionality to our chat web application. The feature will allow users to generate shareable links for documents and associated chat history, with configurable access controls.

## Implementation Approach

### 1. Database Schema Updates

#### Firestore Collections

Add a new `shares` collection with the following structure:

```typescript
interface Share {
  id: string;              // Unique ID for the share (used in URL)
  documentId: string;      // ID of the shared document
  createdBy: string;       // User ID who created the share
  createdAt: number;       // Timestamp when share was created
  expiresAt: number | null; // Optional expiration timestamp
  accessType: 'view' | 'comment'; // Permission level
  includeChat: boolean;    // Whether to include chat history
  accessedBy: {            // Track who accessed the share
    [userId: string]: {
      lastAccessed: number;
      accessCount: number;
    }
  };
  password?: string;       // Optional password protection (hashed)
}
```

### 2. Security Rules Implementation

Update Firebase Security Rules to enforce access control:

```
// Storage Rules
service firebase.storage {
  match /b/{bucket}/o {
    match /documents/{documentId} {
      // Allow read if user has access via shares collection
      allow read: if request.auth != null && 
        exists(/databases/$(database)/documents/shares/{shareId}) && 
        get(/databases/$(database)/documents/shares/{shareId}).data.documentId == documentId;
      
      // Normal document access rules
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/documents/$(documentId)).data.ownerId == request.auth.uid;
    }
  }
}

// Firestore Rules
service cloud.firestore {
  match /databases/{database}/documents {
    match /shares/{shareId} {
      // Only creator can modify/delete shares
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && 
        resource.data.createdBy == request.auth.uid;
      
      // Anyone with the link can read (we'll check expiration in the app)
      allow read: if request.auth != null;
    }
    
    match /chats/{chatId} {
      // Allow read if user has access via shares
      allow read: if request.auth != null && 
        exists(/databases/$(database)/documents/shares/{shareId}) && 
        get(/databases/$(database)/documents/shares/{shareId}).data.includeChat == true &&
        get(/databases/$(database)/documents/shares/{shareId}).data.documentId == resource.data.documentId;
    }
  }
}
```

### 3. API Routes

Create new API endpoints to manage sharing:

#### `/api/shares`
- `POST` - Create a new share
- `GET` - List shares created by the user
- `DELETE` - Remove a share

#### `/api/shares/[id]`
- `GET` - Get share details
- `PUT` - Update share settings
- `POST` - Record access (for analytics)

### 4. Frontend Components

#### Share Dialog Component

```tsx
// components/dashboard/ShareDialog.tsx
import { useState } from 'react';
import { Dialog, Button, Switch, Select, Input } from '@/components/ui';
import { createShare } from '@/lib/firebase/shares';

interface ShareDialogProps {
  documentId: string;
  documentName: string;
  open: boolean;
  onClose: () => void;
}

export function ShareDialog({ documentId, documentName, open, onClose }: ShareDialogProps) {
  const [includeChat, setIncludeChat] = useState(true);
  const [accessType, setAccessType] = useState<'view' | 'comment'>('view');
  const [expirationDays, setExpirationDays] = useState<number | null>(7);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreateShare() {
    setIsCreating(true);
    try {
      const share = await createShare({
        documentId,
        includeChat,
        accessType,
        expirationDays,
        password: isPasswordProtected ? password : undefined
      });
      setShareUrl(`${window.location.origin}/shared/${share.id}`);
    } catch (error) {
      console.error('Error creating share:', error);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogHeader>
        <DialogTitle>Share "{documentName}"</DialogTitle>
        <DialogDescription>
          Create a shareable link to this document and its chat history.
        </DialogDescription>
      </DialogHeader>
      
      <div className="space-y-4 py-4">
        <div className="flex items-center justify-between">
          <label htmlFor="include-chat">Include chat history</label>
          <Switch 
            id="include-chat" 
            checked={includeChat} 
            onCheckedChange={setIncludeChat} 
          />
        </div>
        
        <div className="space-y-2">
          <label htmlFor="access-type">Access level</label>
          <Select 
            id="access-type" 
            value={accessType} 
            onValueChange={(value) => setAccessType(value as 'view' | 'comment')}
          >
            <SelectItem value="view">View only</SelectItem>
            <SelectItem value="comment">Can comment</SelectItem>
          </Select>
        </div>
        
        <div className="space-y-2">
          <label htmlFor="expiration">Link expiration</label>
          <Select 
            id="expiration" 
            value={expirationDays?.toString() || 'never'} 
            onValueChange={(value) => setExpirationDays(value === 'never' ? null : parseInt(value))}
          >
            <SelectItem value="1">1 day</SelectItem>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="never">Never expires</SelectItem>
          </Select>
        </div>
        
        <div className="flex items-center justify-between">
          <label htmlFor="password-protect">Password protect</label>
          <Switch 
            id="password-protect" 
            checked={isPasswordProtected} 
            onCheckedChange={setIsPasswordProtected} 
          />
        </div>
        
        {isPasswordProtected && (
          <div className="space-y-2">
            <label htmlFor="password">Password</label>
            <Input 
              id="password" 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
            />
          </div>
        )}
        
        {shareUrl ? (
          <div className="space-y-2">
            <label>Shareable link</label>
            <div className="flex">
              <Input value={shareUrl} readOnly />
              <Button 
                variant="outline" 
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                }}
              >
                Copy
              </Button>
            </div>
          </div>
        ) : (
          <Button 
            onClick={handleCreateShare} 
            disabled={isCreating}
          >
            {isCreating ? 'Creating...' : 'Create share link'}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
```

#### Shared Document View Page

```tsx
// app/shared/[id]/page.tsx
import { notFound } from 'next/navigation';
import { getShareById } from '@/lib/firebase/shares';
import { PDFViewer } from '@/components/dashboard/PDFViewer';
import { ChatHistory } from '@/components/dashboard/ChatHistory';
import { PasswordPrompt } from '@/components/shared/PasswordPrompt';

export default async function SharedDocumentPage({ params }: { params: { id: string } }) {
  const share = await getShareById(params.id);
  
  if (!share) {
    return notFound();
  }
  
  // Check if share is expired
  if (share.expiresAt && share.expiresAt < Date.now()) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">This shared link has expired</h1>
        <p>The owner of this document has set an expiration date that has passed.</p>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Shared Document</h1>
      
      {share.password ? (
        <PasswordPrompt shareId={params.id} />
      ) : (
        <SharedDocumentContent share={share} />
      )}
    </div>
  );
}

// Client component for content after password verification
'use client';
function SharedDocumentContent({ share }) {
  const [activeTab, setActiveTab] = useState<'document' | 'chat'>('document');
  
  return (
    <div className="space-y-4">
      <div className="flex border-b">
        <button 
          className={`px-4 py-2 ${activeTab === 'document' ? 'border-b-2 border-primary' : ''}`}
          onClick={() => setActiveTab('document')}
        >
          Document
        </button>
        {share.includeChat && (
          <button 
            className={`px-4 py-2 ${activeTab === 'chat' ? 'border-b-2 border-primary' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat History
          </button>
        )}
      </div>
      
      {activeTab === 'document' && (
        <PDFViewer 
          fileUrl={`/api/file-proxy?path=${share.documentPath}`}
          fileName={share.documentName}
          readOnly={share.accessType === 'view'}
        />
      )}
      
      {activeTab === 'chat' && share.includeChat && (
        <ChatHistory 
          documentId={share.documentId}
          readOnly={share.accessType === 'view'}
        />
      )}
    </div>
  );
}
```

### 5. Firebase Functions

Create backend functions to handle share management:

```typescript
// functions/src/shares.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

const db = admin.firestore();

// Create a new share
export const createShare = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const { documentId, includeChat, accessType, expirationDays, password } = data;
  
  // Verify document exists and user has access
  const docRef = await db.collection('documents').doc(documentId).get();
  if (!docRef.exists) {
    throw new functions.https.HttpsError('not-found', 'Document not found');
  }
  
  if (docRef.data().ownerId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'You do not have permission to share this document');
  }
  
  // Calculate expiration if provided
  const expiresAt = expirationDays 
    ? Date.now() + (expirationDays * 24 * 60 * 60 * 1000) 
    : null;
  
  // Hash password if provided
  let hashedPassword = null;
  if (password) {
    hashedPassword = await bcrypt.hash(password, 10);
  }
  
  // Create share record
  const shareId = uuidv4();
  const shareData = {
    id: shareId,
    documentId,
    documentName: docRef.data().name,
    documentPath: docRef.data().path,
    createdBy: context.auth.uid,
    createdAt: Date.now(),
    expiresAt,
    accessType,
    includeChat,
    accessedBy: {},
    password: hashedPassword
  };
  
  await db.collection('shares').doc(shareId).set(shareData);
  
  return { id: shareId };
});

// Verify password for protected shares
export const verifySharePassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const { shareId, password } = data;
  
  const shareRef = await db.collection('shares').doc(shareId).get();
  if (!shareRef.exists) {
    throw new functions.https.HttpsError('not-found', 'Share not found');
  }
  
  const shareData = shareRef.data();
  
  if (!shareData.password) {
    throw new functions.https.HttpsError('failed-precondition', 'This share is not password protected');
  }
  
  const passwordMatches = await bcrypt.compare(password, shareData.password);
  if (!passwordMatches) {
    throw new functions.https.HttpsError('permission-denied', 'Incorrect password');
  }
  
  // Record access
  await db.collection('shares').doc(shareId).update({
    [`accessedBy.${context.auth.uid}`]: {
      lastAccessed: Date.now(),
      accessCount: admin.firestore.FieldValue.increment(1)
    }
  });
  
  return { success: true };
});
```

## Implementation Timeline

1. **Week 1: Database and Backend**
   - Update database schema
   - Implement security rules
   - Create Firebase functions

2. **Week 2: Frontend Components**
   - Implement share dialog
   - Create shared document view page
   - Add password protection UI

3. **Week 3: Testing and Refinement**
   - Test sharing functionality
   - Add analytics for tracking shares
   - Implement email notifications (optional)

## Security Considerations

1. **Access Control**
   - Implement proper security rules in Firebase
   - Verify document ownership before sharing
   - Validate access permissions on each request

2. **Link Security**
   - Use UUID for share IDs to prevent guessing
   - Implement expiration dates for temporary access
   - Add password protection option for sensitive documents

3. **Data Protection**
   - Ensure chat history is properly filtered when shared
   - Prevent modification of documents through shared links
   - Log all access to shared documents for audit purposes

## Future Enhancements

1. **Email Sharing**
   - Send share links directly via email
   - Notify document owner when shared links are accessed

2. **Advanced Permissions**
   - Allow editing documents through shared links
   - Support specific user permissions (by email)

3. **Analytics Dashboard**
   - Track usage of shared documents
   - Provide insights on document engagement
