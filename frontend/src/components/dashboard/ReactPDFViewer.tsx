'use client';

import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Import PDF.js worker from CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js`;

// Import CSS for PDF rendering
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

interface ReactPDFViewerProps {
  file: string;
  pageNumber: number;
  onDocumentLoadSuccess: (numPages: number) => void;
  onDocumentLoadError: (error: string) => void;
  isMobile: boolean;
}

const ReactPDFViewer: React.FC<ReactPDFViewerProps> = ({
  file,
  pageNumber,
  onDocumentLoadSuccess,
  onDocumentLoadError,
  isMobile
}) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(isMobile ? 0.8 : 1.0);
  const [rotation, setRotation] = useState(0);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Handle document load success
  const handleLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    onDocumentLoadSuccess(numPages);
  };

  // Handle document load error
  const handleLoadError = (error: Error) => {
    console.error('Error while loading PDF:', error);
    onDocumentLoadError(error.message);
  };

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const newWidth = containerRef.current.clientWidth;
        setContainerWidth(newWidth);
        
        // On mobile, set width to container width to ensure proper scaling
        if (isMobile) {
          setWidth(newWidth > 0 ? newWidth - 20 : undefined);
        } else {
          setWidth(undefined); // Let PDF.js handle the width on desktop
        }
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [isMobile]);

  // Zoom functions
  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));
  
  // Rotation function
  const rotate = () => setRotation(prev => (prev + 90) % 360);

  return (
    <div ref={containerRef} className="pdf-container flex flex-col items-center w-full">
      {/* Controls for zoom and rotation - only on desktop */}
      {!isMobile && (
        <div className="flex items-center space-x-2 mb-2 self-end">
          <Button variant="outline" size="icon" onClick={zoomOut} className="h-8 w-8">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={zoomIn} className="h-8 w-8">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={rotate} className="h-8 w-8">
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      {/* PDF Document */}
      <div className="pdf-document-container flex-1 w-full overflow-auto">
        <Document
          file={file}
          onLoadSuccess={handleLoadSuccess}
          onLoadError={handleLoadError}
          loading={
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          }
          className="flex justify-center"
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            rotate={rotation}
            width={width}
            renderTextLayer={!isMobile} // Disable text layer on mobile for better performance
            renderAnnotationLayer={!isMobile} // Disable annotations on mobile for better performance
            className="shadow-md"
            loading={
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            }
          />
        </Document>
      </div>
    </div>
  );
};

export default ReactPDFViewer;
