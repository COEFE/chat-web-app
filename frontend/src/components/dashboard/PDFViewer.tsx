'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  ExternalLink, 
  X,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils'; 
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

// Use the locally served worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

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
  className,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1); 
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null); 
  const renderTaskRef = useRef<RenderTask | null>(null); 

  useEffect(() => {
    const loadPdf = async () => {
      setIsLoading(true);
      setError(null);
      setNumPages(0);
      setCurrentPage(1);

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      if (pdfDocRef.current) {
        await pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }

      try {
        console.log(`Fetching PDF from: ${fileUrl}`);
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const pdfData = await response.arrayBuffer();

        console.log('Loading PDF document...');
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;
        pdfDocRef.current = pdf; 
        console.log(`PDF loaded with ${pdf.numPages} pages.`);
        setNumPages(pdf.numPages);
        setIsLoading(false);

      } catch (err: any) {
        console.error('Failed to load or render PDF:', err);
        setError(
          `Failed to load PDF: ${err.message || 'Unknown error'}. Please try downloading or opening in a new tab.`
        );
        setIsLoading(false);
        setNumPages(0);
      }
    };

    loadPdf();

    return () => {
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
        }
        pdfDocRef.current?.destroy();
        pdfDocRef.current = null;
    };
  }, [fileUrl]); 

  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDocRef.current || !canvasRef.current || numPages === 0) {
        return; 
      }

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      try {
        const pageNumber = Math.max(1, Math.min(currentPage, numPages)); 
        console.log(`Rendering page ${pageNumber}...`);
        const page: PDFPageProxy = await pdfDocRef.current.getPage(pageNumber);

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Could not get canvas context');
        }

        const desiredWidth = canvas.parentElement?.clientWidth || 800; 
        const viewport = page.getViewport({ scale: 1 }); 
        const scale = desiredWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = Math.floor(scaledViewport.width * (window.devicePixelRatio || 1));
        canvas.height = Math.floor(scaledViewport.height * (window.devicePixelRatio || 1));
        canvas.style.width = `${Math.floor(scaledViewport.width)}px`;
        canvas.style.height = `${Math.floor(scaledViewport.height)}px`;

        const transform = (window.devicePixelRatio || 1) !== 1 ? [window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0] : undefined;

        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport,
          transform: transform, 
        };
        
        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;
        renderTaskRef.current = null; 
        console.log(`Page ${pageNumber} rendered.`);

      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
            console.error(`Failed to render page ${currentPage}:`, err);
            setError(`Failed to render page ${currentPage}: ${err.message}`);
        }
      }
    };

    renderPage();

  }, [pdfDocRef, currentPage, numPages, canvasRef]); 

  const goToPreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(numPages, prev + 1));
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
          <a
            href={fileUrl}
            download={fileName || 'document.pdf'}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground"
            title="Download PDF"
          >
            <Download className="h-4 w-4" />
          </a>
          
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground"
            title="Open in New Tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          
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
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900 z-10">
            <div className="text-center p-4">
              <div className="animate-spin h-8 w-8 border-4 border-gray-300 dark:border-gray-600 border-t-blue-600 rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Loading PDF...</p>
            </div>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900 z-10">
            <div className="text-center p-4 max-w-md">
              <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={() => window.open(fileUrl, '_blank')}>
                Try Opening Directly
              </Button>
            </div>
          </div>
        )}
        
        {/* PDF Canvas */}
        <canvas 
          ref={canvasRef}
          className={`w-full h-full border-0 ${isLoading || error ? 'hidden' : 'block'}`}
          style={{ 
            display: 'block',
            backgroundColor: '#f5f5f5'
          }}
        />
        
        {/* Pagination Controls */}
        {numPages > 0 && (
          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage <= 1 || isLoading}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              title="Previous page"
              aria-label="Previous page"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            </button>
            <span className="text-sm font-medium text-gray-700 w-16 text-center">
              {currentPage} / {numPages}
            </span>
            <button
              onClick={goToNextPage}
              disabled={currentPage >= numPages || isLoading}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              title="Next page"
              aria-label="Next page"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFViewer;
