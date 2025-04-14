import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MyDocumentData } from '@/types';
import { FileText, FileSpreadsheet, File } from 'lucide-react';
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
  if (!document) return null;

  const getFileIcon = () => {
    if (!document.contentType) return <File className="h-16 w-16 text-gray-400" />;
    
    if (document.contentType.includes('pdf')) {
      return <FileText className="h-16 w-16 text-red-500" />;
    } else if (document.contentType.includes('spreadsheet') || document.contentType.includes('excel') || document.contentType.includes('xlsx')) {
      return <FileSpreadsheet className="h-16 w-16 text-green-500" />;
    } else if (document.contentType.includes('image')) {
      return null; // Will show the actual image
    }
    
    return <File className="h-16 w-16 text-gray-400" />;
  };

  const renderPreviewContent = () => {
    if (!document.contentType) {
      return (
        <div className="flex flex-col items-center justify-center p-10">
          {getFileIcon()}
          <p className="mt-4 text-gray-500">Preview not available</p>
        </div>
      );
    }

    if (document.contentType.includes('pdf')) {
      return (
        <div className="w-full h-[400px]">
          {document.downloadURL ? (
            <div className="w-full h-full">
              <PDFViewer documentUrl={document.downloadURL} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">PDF preview unavailable</p>
            </div>
          )}
        </div>
      );
    } else if (document.contentType.includes('image')) {
      return (
        <div className="flex justify-center p-4">
          {document.downloadURL ? (
            <Image 
              src={document.downloadURL}
              alt={document.name || 'Document preview'}
              width={400}
              height={400}
              style={{ objectFit: 'contain', maxHeight: '400px' }}
            />
          ) : (
            <div className="flex items-center justify-center h-[200px] w-full">
              <p className="text-gray-500">Image preview unavailable</p>
            </div>
          )}
        </div>
      );
    } else if (
      document.contentType.includes('spreadsheet') || 
      document.contentType.includes('excel') || 
      document.contentType.includes('xlsx')
    ) {
      // Simple spreadsheet preview - in a real implementation, 
      // you might want to use a library to render a preview
      return (
        <div className="flex flex-col items-center justify-center p-10">
          <FileSpreadsheet className="h-16 w-16 text-green-500" />
          <p className="mt-4">Excel document - full preview available in document view</p>
        </div>
      );
    }

    // Default preview for other file types
    return (
      <div className="flex flex-col items-center justify-center p-10">
        {getFileIcon()}
        <p className="mt-4 text-gray-500">Preview not available for this file type</p>
        <p className="text-sm text-gray-400">{document.contentType}</p>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{document.name}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          {renderPreviewContent()}
        </div>
        <div className="text-sm text-gray-500 mt-2">
          <p>Type: {document.contentType || 'Unknown'}</p>
          <p>Size: {document.size ? `${Math.round(document.size / 1024)} KB` : 'Unknown'}</p>
          <p>Last modified: {document.updatedAt ? new Date(document.updatedAt.seconds * 1000).toLocaleString() : 'Unknown'}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickPreview;
