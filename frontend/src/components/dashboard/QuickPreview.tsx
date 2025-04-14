import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { MyDocumentData } from '@/types/documents';
import { FileQuestion, FileText, FileSpreadsheet, File } from 'lucide-react';
import PDFViewer from './PDFViewer';
import Image from 'next/image';

interface QuickPreviewProps {
  document: MyDocumentData | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * A lightweight preview component for documents
 * Shows a simplified preview based on document type
 */
const QuickPreview: React.FC<QuickPreviewProps> = ({ document, isOpen, onClose }) => {
  if (!document || !isOpen) return null;

  const renderPreviewContent = () => {
    if (!document.url) {
      return <p className="text-center text-muted-foreground">Preview URL is missing.</p>;
    }

    const fileType = document.type || ''; // Use 'type' instead of 'contentType'

    // PDF Preview
    if (fileType === 'application/pdf') {
      return <PDFViewer documentUrl={document.url} />; // Use documentUrl prop
    }

    // Image Preview
    if (fileType.startsWith('image/')) {
      return (
        <div className="relative w-full h-96"> {/* Adjust height as needed */} 
          <Image
            src={document.url} // Use 'url' instead of 'downloadURL'
            alt={document.name || 'Image preview'}
            layout="fill"
            objectFit="contain"
            unoptimized // If using external URLs directly, might need this depending on Next.js config
          />
        </div>
      );
    }
    
    // Add previews for other common types if needed (e.g., text, video)
    if (fileType.startsWith('text/')) {
         // Basic text preview (consider fetching content if URL is just a download link)
         // This assumes the URL directly serves text or you have a way to fetch it.
         // For simplicity, showing a placeholder.
        return <p className="text-center text-muted-foreground">Text document preview not implemented yet. <a href={document.url} target="_blank" rel="noopener noreferrer" className="underline">Open file</a></p>;
    }

    // Fallback for unsupported types
    return (
      <div className="text-center p-4">
        <FileQuestion className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
        <p className="text-muted-foreground">Preview not available for this file type ({fileType || 'unknown'}).</p>
        <p className="text-sm text-muted-foreground mt-1">
            You can try to <a href={document.url} target="_blank" rel="noopener noreferrer" className="underline">open or download the file</a>.
        </p>
      </div>
    );
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const format = (date: Date, format: string) => {
    // Implement date formatting logic here
    // For simplicity, just return the date in a basic format
    return date.toLocaleString();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[80%] md:max-w-[60%] lg:max-w-[50%] h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{document.name || 'File Preview'}</DialogTitle>
          <DialogDescription>
             Type: {document.type || 'Unknown'} | Size: {document.size ? formatBytes(document.size) : 'N/A'} | Modified: {document.createdAt ? format(new Date(document.createdAt), 'PPp') : 'N/A'} {/* Use createdAt */}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-auto p-1 border rounded-md">
          {renderPreviewContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickPreview;
