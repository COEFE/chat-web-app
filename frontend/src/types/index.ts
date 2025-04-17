import { Timestamp } from 'firebase/firestore';

// Shared interface for document data across components
export interface MyDocumentData {
  id: string; // Firestore document ID
  userId: string;
  name: string;
  storagePath: string;
  folderId: string | null; // ID of the parent folder, or null for root
  uploadedAt: Timestamp; // Use Firestore Timestamp
  updatedAt: Timestamp; // Add the missing updatedAt field
  contentType: string;
  status: string; // e.g., 'uploading', 'complete', 'error'
  downloadURL?: string;
  size?: number; // Size in bytes
  createdAt: Timestamp | null; // Creation timestamp, null if not available
}

// Interface for Folder data
export interface FolderData {
  id: string; // Firestore document ID
  name: string;
  parentFolderId: string | null; // ID of the parent folder, or null for root
  userId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// You might also want a type that represents either a folder or a document
// for use in the display list
export type FilesystemItem = (FolderData & { type: 'folder' }) | (MyDocumentData & { type: 'document' });

// Type for Breadcrumbs
export interface BreadcrumbItem {
  id: string | null; // null represents the root
  name: string;
}
