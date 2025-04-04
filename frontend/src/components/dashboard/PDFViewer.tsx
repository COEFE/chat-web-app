'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, RefreshCw, FileText, Loader2 } from 'lucide-react';

// Props interface for the component
interface PDFViewerProps {
  documentUrl: string;
}

/**
 * A reliable PDF viewer that uses <object> tag and provides multiple
 * viewing options to handle cross-browser compatibility issues
 */
export default function PDFViewer({ documentUrl }: PDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'object' | 'proxy'>('object');
  const [proxyUrl, setProxyUrl] = useState('');
  
  // Handle load event
  const handleLoad = () => {
    setIsLoading(false);
  };
  
  // Handle load error
  const handleError = () => {
    setIsLoading(false);
  };
  
  // Create a proxy URL option by using Google Docs Viewer as fallback
  useEffect(() => {
    // Only set this up when the component mounts
    if (documentUrl) {
      setProxyUrl(`https://docs.google.com/viewer?url=${encodeURIComponent(documentUrl)}&embedded=true`);
    }
  }, [documentUrl]);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar with actions */}
      <div className="flex justify-end gap-2 mb-2">
        <div className="flex-1 flex items-center gap-2">
          {/* View mode toggle */}
          <Button 
            variant={viewMode === 'object' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setViewMode('object')}
            className="flex gap-1 items-center"
          >
            <FileText className="h-4 w-4" />
            Direct View
          </Button>
          <Button 
            variant={viewMode === 'proxy' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setViewMode('proxy')}
            className="flex gap-1 items-center"
          >
            <RefreshCw className="h-4 w-4" />
            Proxy View
          </Button>
        </div>
        
        <Button asChild variant="outline" size="sm">
          <a 
            href={documentUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center"
          >
            <ExternalLink className="mr-1 h-4 w-4" />
            Open
          </a>
        </Button>
        
        <Button asChild variant="outline" size="sm">
          <a 
            href={documentUrl} 
            download 
            className="flex items-center"
          >
            <Download className="mr-1 h-4 w-4" />
            Download
          </a>
        </Button>
      </div>
      
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
          <div className="flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <span className="text-sm text-muted-foreground">Loading PDF...</span>
          </div>
        </div>
      )}
      
      {/* PDF container */}
      <div className="flex-1 overflow-hidden border rounded-md relative">
        {viewMode === 'object' ? (
          <object
            data={documentUrl}
            type="application/pdf"
            className="w-full h-full"
            onLoad={handleLoad}
            onError={handleError}
          >
            <p className="p-4 text-center">
              Your browser cannot display this PDF. Try the proxy view, download or open in new tab options.
            </p>
          </object>
        ) : (
          <iframe
            src={proxyUrl}
            className="w-full h-full"
            title="PDF Document Viewer (via Google Docs)"
            onLoad={handleLoad}
            onError={handleError}
            allowFullScreen
          />
        )}
      </div>
      
      {/* Fallback message */}
      <div className="mt-2 text-sm text-muted-foreground text-center">
        If the PDF doesn't display correctly, try toggling between view modes or use the Download option.
      </div>
    </div>
  );
}
