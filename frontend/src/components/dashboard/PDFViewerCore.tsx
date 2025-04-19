'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Download, X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Document, Page, pdfjs } from 'react-pdf';

// Configure PDF.js worker to use CDN-hosted version
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;
}

interface PDFViewerProps {
  fileUrl: string;
  fileName?: string;
  onClose?: () => void;
  className?: string;
  scale?: number; // Scale prop for zoom level
  rotation?: number; // Rotation prop in degrees (0, 90, 180, 270)
  onDocumentLoaded?: (numPages: number) => void; // Callback when document is loaded
  currentPage?: number; // Current page to display
  onPageChange?: (pageNumber: number) => void; // Callback when page changes
}

// Default PDF.js options (stable identity)
const defaultPdfOptions = Object.freeze({
  cMapUrl: 'https://unpkg.com/pdfjs-dist@3.4.120/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.4.120/standard_fonts/',
});

const PDFViewerCore: React.FC<PDFViewerProps> = ({ 
  fileUrl, 
  fileName = 'document.pdf', 
  onClose, 
  className, 
  scale = 1.0, 
  rotation = 0,
  onDocumentLoaded,
  currentPage,
  onPageChange
}) => {
  const { user } = useAuth();
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  // Use the scale and rotation props if provided, otherwise use local state
  const [localScale, setLocalScale] = useState<number>(scale);
  const [localRotation, setLocalRotation] = useState<number>(rotation);

  // Update local state when props change
  useEffect(() => {
    setLocalScale(scale);
  }, [scale]);
  
  useEffect(() => {
    setLocalRotation(rotation);
  }, [rotation]);
  
  // Use a ref to track the last page number from props to avoid circular updates
  const lastPropPageRef = useRef(currentPage);
  
  // Update page number when currentPage prop changes
  useEffect(() => {
    // Only update if the prop has actually changed from its last value
    if (currentPage !== undefined && currentPage !== lastPropPageRef.current) {
      console.log('PDFViewerCore: Updating page from props:', currentPage);
      lastPropPageRef.current = currentPage;
      setPageNumber(currentPage);
      
      // Immediately scroll to the new page
      setTimeout(() => {
        const pageElement = document.getElementById(`pdf-page-${currentPage}`);
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50); // Small delay to ensure the DOM has updated
    }
  }, [currentPage]);
  
  // Track internal page changes
  const isInternalPageChange = useRef(false);
  
  // Notify parent component when page changes internally
  useEffect(() => {
    // Only notify parent if this was an internal change (not from props)
    if (onPageChange && isInternalPageChange.current) {
      console.log('PDFViewerCore: Notifying parent of internal page change:', pageNumber);
      onPageChange(pageNumber);
      isInternalPageChange.current = false;
    }
  }, [pageNumber, onPageChange]);
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Function to handle successful document loading
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    console.log(`PDF loaded successfully with ${numPages} pages`);
    
    // Notify parent component about document loading and page count
    if (onDocumentLoaded) {
      onDocumentLoaded(numPages);
    }
  };

  // Function to handle document loading error
  const onDocumentLoadError = (err: Error) => {
    console.error('Error loading PDF:', err);
    setError(err.message || 'Failed to load PDF');
    setIsLoading(false);
  };

  // Function to go to the next page
  const goToNextPage = () => {
    if (pageNumber < (numPages || 1)) {
      isInternalPageChange.current = true; // Mark as internal change
      setPageNumber(pageNumber + 1);
    }
  };

  // Function to go to the previous page
  const goToPrevPage = () => {
    if (pageNumber > 1) {
      isInternalPageChange.current = true; // Mark as internal change
      setPageNumber(pageNumber - 1);
    }
  };

  // Function to zoom in
  const zoomIn = () => {
    setLocalScale((prev: number) => Math.min(prev + 0.2, 3.0));
  };

  // Function to zoom out
  const zoomOut = () => {
    setLocalScale((prev: number) => Math.max(prev - 0.2, 0.5));
  };

  // Function to rotate the page locally (for internal use if needed)
  const rotateLocally = () => {
    setLocalRotation((prev) => (prev + 90) % 360);
  };

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

  // Stable ref for options to silence React warning once and for all
  const optionsRef = useRef(defaultPdfOptions);

  return (
    <div className={cn('flex flex-col h-full w-full', className)}>
      {/* PDF content area */}
      <div className="flex-grow relative bg-gray-500 flex justify-center">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            Loading PDF...
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <div className="text-center">
              <div>Error: {error}</div>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2 bg-gray-700 text-white" 
                onClick={() => window.open(fileUrl, '_blank')}
              >
                Try Direct View
              </Button>
            </div>
          </div>
        )}
        
        {/* PDF Document component */}
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<div className="text-white">Loading PDF...</div>}
          error={<div className="text-white">Failed to load PDF</div>}
          className="flex justify-center"
          options={optionsRef.current}
        >
          {!isLoading && !error && numPages && (
            <div className="flex flex-col items-center">
              {Array.from({ length: numPages }, (_, index) => {
                const pageNum = index + 1;
                return (
                  <div 
                    key={`page_container_${pageNum}`} 
                    className="flex justify-center"
                    id={`pdf-page-${pageNum}`} // Add ID for scrolling to specific pages
                  >
                    <Page
                      key={`page_${pageNum}`}
                      pageNumber={pageNum}
                      scale={localScale}
                      rotate={localRotation}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className="shadow-lg my-4"
                      onRenderSuccess={() => {
                        // When the current page renders, scroll to it
                        if (pageNum === pageNumber) {
                          const pageElement = document.getElementById(`pdf-page-${pageNum}`);
                          if (pageElement) {
                            pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Document>
      </div>
    </div>
  );
};

export default PDFViewerCore;
