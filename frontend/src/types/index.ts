import { Timestamp } from 'firebase/firestore';

// Shared interface for document data across components
export type { MyDocumentData } from './documents';

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
