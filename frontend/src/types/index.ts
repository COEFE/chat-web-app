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
  contentType?: string; // Make optional
  status: string; // e.g., 'uploading', 'complete', 'error'
  downloadURL?: string;
  size?: number; // Size in bytes
  createdAt?: Timestamp; // Change to optional Timestamp
  parentId?: string | null; // Add optional parentId
}

// Interface for Folder data
export interface FolderData {
  id: string; // Firestore document ID
  name: string;
  parentFolderId: string | null; // ID of the parent folder, or null for root
  userId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  parentId?: string | null; // Add optional parentId
}

// Represents either a folder or a document for UI display
export type FilesystemItem =
  | (FolderData & { type: 'folder' })
  | (MyDocumentData & {
      type: 'document';
      url?: string; // Can be derived or added later
      // size, contentType, createdAt are now consistently optional via MyDocumentData
    });

// Type for Breadcrumbs
export interface BreadcrumbItem {
  id: string | null; // null represents the root
  name: string;
}
