import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { PaperclipIcon, X } from 'lucide-react';

interface FileUploadButtonProps {
  onFileSelect: (fileData: {
    name: string;
    type: string;
    base64Data: string;
    size: number;
  }) => void;
  onClear?: () => void;
  selectedFile?: {
    name: string;
    size: number;
  } | null;
  disabled?: boolean;
}

export default function FileUploadButton({ 
  onFileSelect, 
  onClear, 
  selectedFile, 
  disabled = false 
}: FileUploadButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Accepted MIME types that Claude supports
    const acceptedTypes = [
      'application/pdf',                    // PDF
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', // Images
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',      // XLSX
      'text/plain', 'text/csv', 'application/rtf'                              // Text formats
    ];
    
    if (!acceptedTypes.includes(file.type)) {
      alert('Unsupported file type. Please upload PDF, Word, Excel, or common image formats.');
      return;
    }
    
    // Check file size (32MB limit for Claude)
    const maxSizeInBytes = 32 * 1024 * 1024; // 32MB in bytes
    if (file.size > maxSizeInBytes) {
      alert(`File exceeds the 32MB size limit (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
      return;
    }
    
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (!event.target?.result) return;
        
        // Remove 'data:application/pdf;base64,' prefix
        const base64String = event.target.result.toString().split(',')[1];
        onFileSelect({
          name: file.name,
          type: file.type,
          base64Data: base64String,
          size: file.size
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error reading file:', error);
      alert('An error occurred while uploading your file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Function to trigger file input click
  const handleButtonClick = () => {
    if (fileInputRef.current && !disabled && !isUploading) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="file-upload-container">
      {!selectedFile ? (
        <>
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.rtf"
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled || isUploading}
          />
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-10 w-10 sm:h-9 sm:w-9 rounded-full flex items-center justify-center" 
            type="button"
            onClick={handleButtonClick}
            disabled={disabled || isUploading}
          >
            <PaperclipIcon className="h-5 w-5" />
            <span className="sr-only">Attach document</span>
          </Button>
        </>
      ) : (
        <div className="flex items-center gap-1 sm:gap-2 bg-slate-100 dark:bg-slate-800 px-2 sm:px-3 py-1 rounded-full max-w-[120px] sm:max-w-[150px]">
          <span className="text-xs font-medium truncate w-full" title={selectedFile.name}>
            {selectedFile.name.length > 12 
              ? `${selectedFile.name.substring(0, 8)}...${selectedFile.name.split('.').pop()}` 
              : selectedFile.name}
          </span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 rounded-full flex-shrink-0 p-0" 
            onClick={handleClear}
            type="button"
          >
            <X className="h-3 w-3" />
            <span className="sr-only">Remove</span>
          </Button>
        </div>
      )}
    </div>
  );
}
