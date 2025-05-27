import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { PaperclipIcon, X } from 'lucide-react';
import heic2any from 'heic2any';

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

// Function to convert HEIC to JPEG using heic2any library
const convertHeicToJpeg = async (file: File): Promise<File> => {
  try {
    // Convert HEIC to JPEG blob
    const convertedBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9
    });
    
    // Handle both single blob and array of blobs
    const jpegBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
    
    // Create a new File object with JPEG type
    const convertedFile = new File(
      [jpegBlob], 
      file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'),
      { type: 'image/jpeg' }
    );
    
    return convertedFile;
  } catch (error) {
    console.error('HEIC conversion error:', error);
    throw new Error('Failed to convert HEIC to JPEG');
  }
};

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
    
    setIsUploading(true);
    
    try {
      let processedFile = file;
      
      // Check if it's a HEIC file and convert to JPEG
      if (file.type === 'image/heic' || file.type === 'image/heif' || 
          file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
        try {
          processedFile = await convertHeicToJpeg(file);
          console.log('Converted HEIC to JPEG:', processedFile.name);
        } catch (error) {
          console.error('HEIC conversion failed:', error);
          alert('Failed to convert HEIC image. Please try converting it to JPEG manually.');
          setIsUploading(false);
          return;
        }
      }
      
      // Accepted MIME types that Claude supports (including HEIC for processing)
      const acceptedTypes = [
        'application/pdf',                    // PDF
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', // Images supported by Claude
        'image/heic', 'image/heif',          // HEIC (will be converted to JPEG)
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',      // XLSX
        'text/plain', 'text/csv', 'application/rtf'                              // Text formats
      ];
      
      // Check if original file type is supported (before any conversion)
      if (!acceptedTypes.includes(file.type) && 
          !file.name.toLowerCase().endsWith('.heic') && 
          !file.name.toLowerCase().endsWith('.heif')) {
        alert('Unsupported file type. Please upload PDF, Word, Excel, HEIC, or common image formats.');
        setIsUploading(false);
        return;
      }
      
      // Check file size (32MB limit for Claude) - use processed file size
      const maxSizeInBytes = 32 * 1024 * 1024; // 32MB in bytes
      if (processedFile.size > maxSizeInBytes) {
        alert(`File exceeds the 32MB size limit (${(processedFile.size / (1024 * 1024)).toFixed(2)}MB)`);
        setIsUploading(false);
        return;
      }
      
      // Remove 'data:application/pdf;base64,' prefix
      const reader = new FileReader();
      reader.onload = (event) => {
        if (!event.target?.result) return;
        
        const base64String = event.target.result.toString().split(',')[1];
        onFileSelect({
          name: processedFile.name,
          type: processedFile.type,
          base64Data: base64String,
          size: processedFile.size
        });
      };
      reader.readAsDataURL(processedFile);
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
            accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.rtf,.heic,.heif"
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
