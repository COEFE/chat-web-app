export interface MyDocumentData {
  storagePath?: string;
  contentType?: string;
  id: string;
  name: string;
  type: string; // MIME type (e.g., 'application/pdf', 'image/png')
  url: string; // URL to access/download the document content
  size?: number; // Size in bytes (optional)
  createdAt?: any; // Firestore Timestamp or JS Date (optional) - Use 'any' for flexibility or a specific union type
  userId?: string; // ID of the user who owns/uploaded it (optional)
  isFolder?: boolean; // Flag to indicate if the item is a folder (optional)
  parentId?: string | null; // ID of the parent folder, null for root (optional)
  // Add any other relevant fields specific to your application
}
