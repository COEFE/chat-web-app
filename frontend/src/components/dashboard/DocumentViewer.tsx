'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

// Import CSS for PDF rendering
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Document interface (consider moving to a shared types file)
interface MyDocumentData {
  id: string;
  name: string;
  contentType: string;
  size: number;
  userId: string;
  createdAt: Timestamp;
  downloadURL: string;
}

// Dynamically import PDFViewer component to isolate PDF.js related code
const PDFViewer = dynamic(() => import('./PDFViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="ml-2">Loading PDF viewer...</span>
    </div>
  )
});

// Main DocumentViewer component
export default function DocumentViewer({ document }: { document: MyDocumentData }) {
  // For text files
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch text content for plain text files
  useEffect(() => {
    const fetchTextContent = async () => {
      if (document.contentType === 'text/plain') {
        try {
          setIsLoading(true);
          setError(null);
          
          const response = await fetch(document.downloadURL);
          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
          }
          
          const text = await response.text();
          setTextContent(text);
        } catch (err) {
          console.error('Error fetching text file:', err);
          setError(`Failed to load text: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchTextContent();
  }, [document]);

  return (
    <div className="flex flex-col h-full">
      {/* Loading state for text files */}
      {isLoading && document.contentType === 'text/plain' && (
        <div className="flex-1 flex justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-4 text-destructive bg-destructive/10 border border-destructive rounded-md mb-4">
          {error}
        </div>
      )}

      {/* PDF Viewer */}
      {document.contentType === 'application/pdf' && (
        <PDFViewer documentUrl={document.downloadURL} />
      )}

      {/* Text Viewer */}
      {document.contentType === 'text/plain' && !isLoading && !error && textContent && (
        <div className="flex-1 overflow-auto border rounded-md p-4 whitespace-pre-wrap font-mono text-sm">
          {textContent}
        </div>
      )}

      {/* Unsupported format */}
      {!['application/pdf', 'text/plain'].includes(document.contentType) && (
        <div className="flex-1 flex items-center justify-center border rounded-md bg-muted/10">
          <div className="text-center p-4">
            <p className="text-muted-foreground mb-2">Preview not available for {document.contentType}</p>
            <Button asChild variant="outline">
              <a href={document.downloadURL} target="_blank" rel="noopener noreferrer">
                Download File
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
