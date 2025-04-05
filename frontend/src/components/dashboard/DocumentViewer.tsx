'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx'; // Import xlsx library

// Import CSS for PDF rendering
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Use the shared document interface
import { MyDocumentData } from '@/types';

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
  // === NEW: State for Excel/CSV HTML content ===
  const [sheetHtml, setSheetHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract the storage path from the downloadURL
  const getStoragePath = (url: string): string | null => {
    try {
      // Parse the URL to extract the path parameter
      const parsedUrl = new URL(url);
      
      // The path is in the format /v0/b/BUCKET_NAME/o/PATH?alt=media&token=TOKEN
      // We need to extract just the PATH part
      const objectPath = parsedUrl.pathname.split('/o/')[1];
      if (!objectPath) return null;
      
      // Remove any query parameters if present
      const pathWithoutQuery = objectPath.split('?')[0];
      
      // URL decode the path
      return decodeURIComponent(pathWithoutQuery);
    } catch (e) {
      console.error('Failed to parse storage URL:', e);
      return null;
    }
  };

  // Fetch content based on document type
  useEffect(() => {
    const fetchDocumentContent = async () => {
      if (!document || !document.downloadURL) {
        setError('Document data or download URL is missing.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setTextContent(null); // Reset other content types
      setSheetHtml(null);  // Reset other content types

      try {
        // Extract the storage path from the downloadURL
        const storagePath = getStoragePath(document.downloadURL);
        if (!storagePath) {
          throw new Error('Could not extract storage path from URL');
        }

        // Use our proxy API instead of direct Firebase Storage URL
        const proxyUrl = `/api/file-proxy?path=${encodeURIComponent(storagePath)}`;
        console.log('Using proxy URL:', proxyUrl);
        
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        // Handle different content types
        if (document.contentType === 'text/plain') {
          const text = await response.text();
          setTextContent(text);
        } else if ([
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv' // .csv
          ].includes(document.contentType)) 
        {
          const arrayBuffer = await response.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
          // Get the first sheet name
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // Convert sheet to HTML table
          const html = XLSX.utils.sheet_to_html(worksheet);
          setSheetHtml(html);
        } else if (document.contentType !== 'application/pdf') {
          // If it's not PDF and not handled above, set an error or specific state
          console.log(`Unsupported preview for contentType: ${document.contentType}`);
          //setError(`Preview not available for ${document.contentType}`);
        }
        // PDF is handled by the dynamic PDFViewer component, no fetch needed here

      } catch (err) {
        console.error('Error fetching document content:', err);
        setError(`Failed to load document content: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocumentContent();
  }, [document]); // Re-run when the document prop changes

  // Define supported types for clarity
  const isPdf = document?.contentType === 'application/pdf';
  const isText = document?.contentType === 'text/plain';
  const isSheet = document && [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
      'application/vnd.ms-excel', 
      'text/csv'
    ].includes(document.contentType);
  const isPreviewSupported = isPdf || isText || isSheet;

  return (
    <div className="flex flex-col h-full">
      {/* Loading state */}
      {isLoading && (
        <div className="flex-1 flex justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading preview...</span>
        </div>
      )}

      {/* Error display */}
      {!isLoading && error && (
        <div className="p-4 text-destructive bg-destructive/10 border border-destructive rounded-md mb-4">
          {error}
        </div>
      )}

      {/* PDF Viewer */} 
      {!isLoading && !error && isPdf && document.downloadURL && (
        <PDFViewer documentUrl={`/api/file-proxy?path=${encodeURIComponent(getStoragePath(document.downloadURL) || '')}`} />
      )}

      {/* Text Viewer */}
      {!isLoading && !error && isText && textContent && (
        <div className="flex-1 overflow-auto border rounded-md p-4 whitespace-pre-wrap font-mono text-sm">
          {textContent}
        </div>
      )}

      {/* === NEW: Excel/CSV Viewer === */}
      {!isLoading && !error && isSheet && sheetHtml && (
        <div 
          className="flex-1 overflow-auto border rounded-md p-4 [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:p-2 [&_th]:text-left [&_th]:bg-muted [&_td]:border [&_td]:p-2"
          dangerouslySetInnerHTML={{ __html: sheetHtml }}
        />
      )}

      {/* Unsupported format / No content */} 
      {!isLoading && !error && !isPreviewSupported && (
        <div className="flex-1 flex items-center justify-center border rounded-md bg-muted/10">
          <div className="text-center p-4">
            <p className="text-muted-foreground mb-2">Preview not available for {document?.contentType || 'this file type'}</p>
            {document?.downloadURL && (
              <Button asChild variant="outline">
                <a href={document.downloadURL} target="_blank" rel="noopener noreferrer">
                  Download File
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
