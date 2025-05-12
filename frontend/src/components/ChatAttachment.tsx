import React from 'react';
import { FileIcon, FileText, ImageIcon, FileSpreadsheet, FileType, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatAttachmentProps {
  fileName: string;
  fileSize: number;
  onRemove: () => void;
  className?: string;
}

export default function ChatAttachment({ 
  fileName, 
  fileSize, 
  onRemove,
  className = ''
}: ChatAttachmentProps) {
  // Determine file type based on extension
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  
  // Get appropriate icon based on file type
  const getFileIcon = () => {
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) {
      return <ImageIcon className="h-4 w-4 text-purple-500" />;
    } else if (['xlsx', 'xls', 'csv'].includes(fileExtension)) {
      return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
    } else if (['pdf', 'docx', 'doc', 'rtf', 'txt'].includes(fileExtension)) {
      return <FileText className="h-4 w-4 text-blue-500" />;
    } else {
      return <FileIcon className="h-4 w-4 text-gray-500" />;
    }
  };
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className={`flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-md ${className}`}>
      {getFileIcon()}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" title={fileName}>
          {fileName}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {formatFileSize(fileSize)}
        </div>
      </div>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" 
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
        <span className="sr-only">Remove attachment</span>
      </Button>
    </div>
  );
}
