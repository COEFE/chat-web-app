import { Timestamp } from 'firebase/firestore';

// Shared interface for document data across components
export interface MyDocumentData {
  id: string; // Firestore document ID
  userId: string;
  name: string;
  storagePath: string;
  uploadedAt: Timestamp; // Use Firestore Timestamp
  updatedAt: Timestamp; // Add the missing updatedAt field
  contentType: string;
  status: string; // e.g., 'uploading', 'complete', 'error'
  downloadURL?: string;
  size: number; // Size in bytes
  createdAt: Timestamp | null; // Creation timestamp, null if not available
}
