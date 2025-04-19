'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { 
  Download, 
  ExternalLink, 
  X,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils'; 

interface PDFViewerProps {
  fileUrl: string; 
  fileName?: string;
  onClose?: () => void;
  className?: string;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ 
  fileUrl, 
  fileName, 
  onClose, 
  className 
}) => {
  const { user } = useAuth();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Clean up object URL when component unmounts or fileUrl changes
  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);
  
  // Fetch PDF data and create object URL
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    
    const fetchPdf = async () => {
      if (!user || !fileUrl) {
        if (isMounted) {
          setError(fileUrl ? 'User not authenticated.' : 'No file URL provided.');
          setIsLoading(false);
        }
        return;
      }
      
      try {
        console.log('Fetching PDF from:', fileUrl);
        
        // Get authentication token
        const token = await user.getIdToken();
        const headers = { 
          'Authorization': `Bearer ${token}` 
        };
        
        // Fetch the PDF as a blob
        const response = await fetch(fileUrl, { headers });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const blob = await response.blob();
        
        if (isMounted) {
          // Create object URL from blob
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
          setError(null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Error fetching PDF:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
          setIsLoading(false);
        }
      }
    };
    
    fetchPdf();
    
    return () => {
      isMounted = false;
    };
  }, [fileUrl, user]);
  
  // Handle download
  const handleDownload = () => {
    if (objectUrl) {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName || 'document.pdf';
      a.click();
    }
  };
  
  return (
    <div className={cn(
      'flex flex-col w-full h-full bg-white dark:bg-gray-900 rounded-md shadow-md overflow-hidden',
      className
    )}>
      {/* Header with controls */}
      <div className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="text-sm font-medium truncate flex-grow px-2">
          {fileName || 'PDF Document'}
        </div>
        
        {/* Right Controls */}
        <div className="flex items-center space-x-1">
          <Button variant="ghost" size="icon" onClick={handleDownload} disabled={!objectUrl} title="Download PDF">
            <Download className="h-4 w-4" />
          </Button>
          
          {objectUrl && (
            <a
              href={objectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground"
              title="Open in New Tab"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} title="Close Viewer">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Main content area */}
      <div className="flex-grow relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center p-4">
              <div className="animate-spin h-8 w-8 border-4 border-gray-300 dark:border-gray-600 border-t-blue-600 rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Loading PDF...</p>
            </div>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center p-4 max-w-md">
              <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={() => window.open(fileUrl, '_blank')}>
                Try Opening Directly
              </Button>
            </div>
          </div>
        )}
        
        {!isLoading && !error && objectUrl && (
          <iframe 
            src={objectUrl}
            className="w-full h-full border-0"
            title={fileName || "PDF Document"}
          />
        )}
      </div>
    </div>
  );
};

export default PDFViewer;
