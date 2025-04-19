'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Download, X, ExternalLink, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import PDFViewerCore from './PDFViewerCore';

interface PDFViewerProps {
  fileUrl: string;
  fileName?: string;
  onClose?: () => void;
  className?: string;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ fileUrl, fileName = 'document.pdf', onClose, className }) => {
  const { user } = useAuth();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [scale, setScale] = useState(1.0); // Add state for zoom level
  const [rotation, setRotation] = useState(0); // Add state for rotation
  const [currentPage, setCurrentPage] = useState(1); // Current page number
  const [totalPages, setTotalPages] = useState(0); // Total number of pages
  
  // Detect mobile devices
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      setIsMobile(isMobileDevice);
    };
    
    checkMobile();
  }, []);

  // Effect to fetch PDF and create object URL - only runs when fileUrl changes
  useEffect(() => {
    if (!fileUrl) {
      setError("No file URL provided");
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    // Clean up any existing object URL before creating a new one
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
    }

    const fetchPdf = async () => {
      try {
        console.log('Fetching PDF from:', fileUrl);
        const response = await fetch(fileUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        console.log('Content type:', contentType);
        
        if (!contentType || !contentType.includes('application/pdf')) {
          console.warn(`Expected PDF but got ${contentType}`);
        }

        const blob = await response.blob();
        console.log('Blob size:', blob.size, 'bytes');
        
        if (!isMounted) return;
        
        // Create object URL from blob
        const url = URL.createObjectURL(blob);
        console.log('Created object URL for PDF:', url);
        setObjectUrl(url);
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching PDF:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
          setIsLoading(false);
        }
      }
    };

    fetchPdf();

    // Cleanup function
    return () => {
      isMounted = false;
      if (objectUrl) {
        console.log('Cleanup: Revoking object URL');
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileUrl]); // Only depend on fileUrl, not objectUrl

  const handleDownload = () => {
    if (fileUrl) {
      // For download, use the original fileUrl with download=true parameter
      const downloadUrl = fileUrl.includes('?') 
        ? `${fileUrl}&download=true` 
        : `${fileUrl}?download=true`;
      
      console.log('Attempting download via URL:', downloadUrl);
      window.open(downloadUrl, '_blank');
    } else {
      console.error('Cannot download: fileUrl is missing');
    }
  };

  const handleOpenInNewTab = () => {
    // Always use the original fileUrl for opening in a new tab
    // as blob URLs won't work in a new tab context
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  };
  
  // Zoom functions
  const zoomIn = () => {
    setScale(prevScale => Math.min(prevScale + 0.2, 3.0)); // Limit max zoom to 3x
  };

  const zoomOut = () => {
    setScale(prevScale => Math.max(prevScale - 0.2, 0.5)); // Limit min zoom to 0.5x
  };

  const resetZoom = () => {
    setScale(1.0);
  };
  
  // Rotation function
  const rotate = () => {
    setRotation(prevRotation => (prevRotation + 90) % 360); // Rotate 90 degrees clockwise (0, 90, 180, 270, 0, ...)
  };
  
  // Page navigation functions
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  
  // Handle document loaded event
  const handleDocumentLoaded = (numPages: number) => {
    setTotalPages(numPages);
    setCurrentPage(1); // Reset to first page when a new document is loaded
  };
  
  // State for page input field
  const [pageInputValue, setPageInputValue] = useState('1');
  
  // Update page input when current page changes
  useEffect(() => {
    setPageInputValue(currentPage.toString());
  }, [currentPage]);
  
  // Handle page input change
  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow any input, even if temporarily invalid
    setPageInputValue(e.target.value);
  };
  
  // Handle page input blur or enter key
  const handlePageInputSubmit = (e: React.KeyboardEvent<HTMLInputElement> | React.FocusEvent<HTMLInputElement>) => {
    if (e.type === 'keydown' && (e as React.KeyboardEvent<HTMLInputElement>).key !== 'Enter') {
      return; // Only process on Enter key for keydown events
    }
    
    const value = parseInt(pageInputValue);
    if (!isNaN(value) && value >= 1 && value <= totalPages) {
      console.log('Navigating to page:', value);
      setCurrentPage(value);
    } else {
      // Reset to current page if invalid input
      setPageInputValue(currentPage.toString());
    }
  };

  return (
    <div className={cn('relative flex flex-col h-full w-full bg-gray-100 dark:bg-gray-900', className)}>
      {/* Header with controls */}
      <div className="flex items-center justify-between p-2 bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
        <div className="flex-1"></div> {/* Empty div to push controls to the right */}
        <div className="flex items-center space-x-1">
          {/* Zoom controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomOut}
            title="Zoom Out"
            disabled={isLoading || !!error}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          
          <span className="text-xs font-medium px-1 min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </span>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomIn}
            title="Zoom In"
            disabled={isLoading || !!error}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          
          {/* Rotate button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={rotate}
            title="Rotate 90°"
            disabled={isLoading || !!error}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
          </Button>
          
          {/* Page navigation */}
          {totalPages > 0 && (
            <div className="flex items-center space-x-1 ml-2 mr-2 border-l border-r px-2 border-gray-300 dark:border-gray-700">
              <Button
                variant="ghost"
                size="sm"
                onClick={goToPrevPage}
                disabled={currentPage <= 1 || isLoading || !!error}
                title="Previous Page"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </Button>
              
              <div className="flex items-center">
                <input
                  type="text"
                  value={pageInputValue}
                  onChange={handlePageInputChange}
                  onKeyDown={handlePageInputSubmit}
                  onBlur={handlePageInputSubmit}
                  className="w-8 h-6 text-center text-xs bg-transparent border border-gray-300 dark:border-gray-700 rounded"
                  disabled={isLoading || !!error}
                />
                <span className="text-xs mx-1">of</span>
                <span className="text-xs">{totalPages}</span>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={goToNextPage}
                disabled={currentPage >= totalPages || isLoading || !!error}
                title="Next Page"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </Button>
            </div>
          )}
          
          {/* Open in new tab button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenInNewTab}
            title="Open in New Tab"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          
          {/* Download button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            title="Download PDF"
            disabled={isLoading}
          >
            <Download className="h-4 w-4" />
          </Button>
          
          {/* Close button */}
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              title="Close Viewer"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* PDF content area */}
      <div className="flex-grow relative overflow-y-auto bg-gray-500">
        {/* Loading state */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <div className="text-center">
              <div className="mb-2">Loading PDF...</div>
              <div className="text-sm text-gray-300">This may take a moment</div>
            </div>
          </div>
        )}
        
        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4">
            <p className="mb-4">Error loading PDF: {error}</p>
            <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
              <Button 
                variant="outline" 
                onClick={handleOpenInNewTab}
                className="bg-gray-700 hover:bg-gray-600"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in New Tab
              </Button>
              <Button 
                variant="outline" 
                onClick={handleDownload}
                className="bg-gray-700 hover:bg-gray-600"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
        )}
        
        {/* PDF viewer using PDFViewerCore */}
        {!isLoading && !error && objectUrl && (
          <PDFViewerCore
            fileUrl={objectUrl}
            fileName={fileName}
            onClose={onClose}
            className="h-full w-full"
            scale={scale} /* Pass scale to PDFViewerCore */
            rotation={rotation} /* Pass rotation to PDFViewerCore */
            onDocumentLoaded={handleDocumentLoaded} /* Get notified when document is loaded */
            currentPage={currentPage} /* Control current page */
            onPageChange={setCurrentPage} /* Get notified when page changes */
          />
        )}
      </div>
    </div>
  );
};

export default PDFViewer;
