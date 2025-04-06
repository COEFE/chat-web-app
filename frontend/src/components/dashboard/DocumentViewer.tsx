'use client';

import React, { useState, useEffect, useRef, MouseEvent, WheelEvent } from 'react';
import dynamic from 'next/dynamic';
import { Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Loader2, ZoomIn, ZoomOut, RotateCw, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx'; // Import xlsx library
import mammoth from 'mammoth'; // Import mammoth for DOCX handling
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"; // Import Shadcn Tabs

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
  // State for workbook data and active sheet
  const [workbookData, setWorkbookData] = useState<{ sheetName: string; data: any[][] }[] | null>(null);
  const [activeSheetName, setActiveSheetName] = useState<string | null>(null);
  // State for DOCX HTML content
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  // State for image viewing
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch content based on document type
  useEffect(() => {
    const fetchDocumentContent = async () => {
      if (!document || !document.storagePath) {
        setError('Document data or storage path is missing.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setTextContent(null); // Reset other content types
      setWorkbookData(null); // Reset workbook data
      setActiveSheetName(null); // Reset active sheet
      setDocxHtml(null);   // Reset DOCX content
      setImageUrl(null);   // Reset image content
      setZoom(1);          // Reset zoom level
      setRotation(0);      // Reset rotation
      setPosition({ x: 0, y: 0 }); // Reset position

      try {
        // Use the storage path directly from the document data
        const storagePath = document.storagePath; 
        if (!storagePath) { 
          throw new Error('Storage path is missing from document data.');
        }

        // Use our proxy API instead of direct Firebase Storage URL
        // Include userId to help with file lookup if needed
        const userId = document.userId || '';
        const proxyUrl = `/api/file-proxy?path=${encodeURIComponent(storagePath)}&userId=${encodeURIComponent(userId)}`;
        console.log('Using proxy URL:', proxyUrl);
        console.log('Document metadata:', { 
          name: document.name, 
          storagePath: document.storagePath,
          userId: document.userId,
          contentType: document.contentType
        });
        
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        // PDF is handled by the dynamic PDFViewer component, no direct fetch/state update needed here
        // unless we want to explicitly track PDF state for some reason.

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
          const data = await response.arrayBuffer();
          if (data) {
            try {
              // Read the workbook with sheetStubs option to include empty cells
              const workbook = XLSX.read(new Uint8Array(data), { type: 'array', sheetStubs: true });
              
              const sheets = workbook.SheetNames.map(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                
                // Get the range of the worksheet
                const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
                
                // Fill in any missing cells in the worksheet
                for (let r = range.s.r; r <= range.e.r; ++r) {
                  for (let c = range.s.c; c <= range.e.c; ++c) {
                    const cellAddress = XLSX.utils.encode_cell({ r, c });
                    if (!worksheet[cellAddress]) {
                      // Add empty cell
                      worksheet[cellAddress] = { t: 's', v: '' };
                    }
                  }
                }
                
                // Convert to JSON with defval option to handle empty cells
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                  header: 1,
                  defval: '' // Use empty string for blank cells
                }) as any[][];
                
                return { sheetName, data: jsonData };
              });
              
              setWorkbookData(sheets);
              if (sheets.length > 0) {
                setActiveSheetName(sheets[0].sheetName);
              }
            } catch (error) {
              console.error('Error parsing Excel file:', error);
              setError('Error parsing Excel file. The file may be corrupted or in an unsupported format.');
            }
          }
        } else if (document.contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          // Handle DOCX files using Mammoth.js
          const arrayBuffer = await response.arrayBuffer();
          try {
            const result = await mammoth.convertToHtml({ arrayBuffer });
            setDocxHtml(result.value);
          } catch (mammothError) {
            console.error('Error converting DOCX:', mammothError);
            setError(`Failed to convert DOCX file: ${mammothError instanceof Error ? mammothError.message : String(mammothError)}`);
          }
        } else if (['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(document.contentType)) {
          // Handle image files
          setImageUrl(proxyUrl);
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

  // Effect to set active sheet when workbookData changes
  useEffect(() => {
    if (workbookData && workbookData.length > 0 && !activeSheetName) {
      setActiveSheetName(workbookData[0].sheetName);
    }
  }, [workbookData, activeSheetName]);

  // --- Derived Constants for Content Type ---
  const isPdf = document?.contentType?.includes('pdf');
  const isText = [
    'text/plain', 
    'text/markdown', 
    'application/json'
  ].includes(document?.contentType || '');
  const isSheet = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv' // .csv
  ].includes(document?.contentType || '');
  const isImage = document?.contentType?.startsWith('image/');
  const isDocx = document?.contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  // Determine if any preview is supported
  const isPreviewSupported = isPdf || isText || isSheet || isImage || isDocx;
  // --- End Derived Constants ---

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header with Title and Refresh Button */}
      {isSheet && document.id && (
        <div className="mb-2 p-2 bg-muted/20 border rounded-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">Document ID:</div>
              <code className="px-2 py-1 bg-primary/10 rounded text-xs">{document.id}</code>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(document.id);
                  // You could add a toast notification here
                }}
                title="Copy document ID to clipboard"
              >
                Copy
              </Button>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                // Removed refreshDocument function
              }}
              className="h-7 px-2 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh Document
            </Button>
            {document.storagePath && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                asChild
              >
                <a 
                  href={`/api/file-proxy?path=${encodeURIComponent(document.storagePath)}&userId=${document.userId}`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  download={document.name || 'document.xlsx'}
                >
                  Download
                </a>
              </Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Use this ID when asking Claude to edit this Excel file
          </div>
        </div>
      )}
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error display */}
      {!isLoading && error && (
        <div className="p-4 text-destructive bg-destructive/10 border border-destructive rounded-md mb-4">
          {error}
        </div>
      )}

      {/* PDF Viewer */} 
      {!isLoading && !error && isPdf && document?.storagePath && (
        <PDFViewer documentUrl={`/api/file-proxy?path=${encodeURIComponent(document.storagePath)}&userId=${document.userId}`} />
      )}

      {/* Text Viewer */}
      {!isLoading && !error && isText && textContent && (
        <div className="flex-1 overflow-auto border rounded-md p-4 whitespace-pre-wrap font-mono text-sm">
          {textContent}
        </div>
      )}

      {/* Excel Viewer */}
      {!isLoading && !error && isSheet && workbookData && (
        <div className="flex-1 overflow-auto">
          <Tabs defaultValue={activeSheetName || (workbookData[0]?.sheetName || '')}>
            <TabsList className="mb-2">
              {workbookData.map((sheet) => (
                <TabsTrigger 
                  key={sheet.sheetName} 
                  value={sheet.sheetName}
                  onClick={() => setActiveSheetName(sheet.sheetName)}
                >
                  {sheet.sheetName}
                </TabsTrigger>
              ))}
            </TabsList>
            {workbookData.map((sheet) => (
              <TabsContent key={sheet.sheetName} value={sheet.sheetName}>
                <div className="overflow-auto border rounded-md" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                  <table className="border-collapse w-full" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      {/* Column for row headers */}
                      <col style={{ width: '60px' }} />
                      
                      {/* Columns for data - generate one col element per column */}
                      {sheet.data[0]?.map((_: any, colIndex: number) => (
                        <col key={colIndex} style={{ width: '120px' }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {/* Empty cell for row header column */}
                        <th className="border border-border bg-muted p-2 text-xs font-medium text-muted-foreground sticky top-0 left-0 z-30">
                          {/* Corner cell */}
                        </th>
                        
                        {/* Column headers - using first row data to determine columns */}
                        {sheet.data[0]?.map((_: any, colIndex: number) => {
                          // Generate Excel-style column headers (A, B, C, ... Z, AA, AB, etc.)
                          let colName = '';
                          if (colIndex < 26) {
                            colName = String.fromCharCode(65 + colIndex); // A-Z
                          } else {
                            const firstChar = String.fromCharCode(65 + Math.floor(colIndex / 26) - 1);
                            const secondChar = String.fromCharCode(65 + (colIndex % 26));
                            colName = firstChar + secondChar; // AA-ZZ
                          }
                          
                          return (
                            <th 
                              key={colIndex}
                              className="border border-border bg-muted p-2 text-xs font-medium text-muted-foreground sticky top-0 z-20"
                            >
                              {colName}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.data.map((row: any, rowIndex: number) => (
                        <tr key={rowIndex}>
                          {/* Row header - row number */}
                          <th className="border border-border bg-muted p-2 text-xs font-medium text-muted-foreground sticky left-0">
                            {rowIndex + 1}
                          </th>
                          
                          {/* Row cells */}
                          {row.map((cell: any, cellIndex: number) => (
                            <td 
                              key={cellIndex} 
                              className="border border-border p-2 text-sm overflow-hidden text-ellipsis whitespace-nowrap"
                            >
                              {cell !== null && cell !== undefined ? String(cell) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
      
      {/* DOCX Viewer */}
      {!isLoading && !error && isDocx && docxHtml && (
        <div 
          className="flex-1 overflow-auto border rounded-md p-4 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: docxHtml }}
        />
      )}
      
      {/* Image Viewer */}
      {!isLoading && !error && isImage && imageUrl && (
        <div className="flex flex-col h-full">
          <div className="flex justify-center gap-2 p-2 bg-muted/20 border-b">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setZoom(prev => Math.min(prev + 0.1, 3))}
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.5))}
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setRotation(prev => (prev + 90) % 360)}
              title="Rotate"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setZoom(1);
                setRotation(0);
                setPosition({ x: 0, y: 0 });
              }}
              title="Reset"
            >
              Reset
            </Button>
          </div>
          <div 
            ref={imageContainerRef}
            className="flex-1 overflow-hidden relative"
            onMouseDown={(e: MouseEvent) => {
              if (e.button === 0) { // Left click only
                // Removed setIsDragging(true);
                setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
              }
            }}
            onMouseMove={(e: MouseEvent) => {
              // Removed if (isDragging) {
                setPosition({
                  x: e.clientX - dragStart.x,
                  y: e.clientY - dragStart.y
                });
              // }
            }}
            onMouseUp={() => {
              // Removed setIsDragging(false);
            }}
            onMouseLeave={() => {
              // Removed setIsDragging(false);
            }}
            onWheel={(e: WheelEvent) => {
              e.preventDefault();
              const delta = e.deltaY * -0.01;
              setZoom(prev => Math.max(0.5, Math.min(3, prev + delta)));
            }}
          >
            <img 
              src={imageUrl} 
              alt={document.name || 'Document image'}
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center',
                transition: 'transform 0.2s ease-out',
                cursor: 'grab'
              }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-none"
            />
          </div>
        </div>
      )}

      {/* Unsupported format / No content */} 
      {!isLoading && !error && !isPreviewSupported && (
        <div className="flex-1 flex items-center justify-center border rounded-md bg-muted/10">
          <div className="text-center p-4">
            <p className="text-muted-foreground mb-2">Preview not available for {document?.contentType || 'this file type'}.</p>
            {document?.storagePath && (
              <Button asChild variant="outline">
                <a 
                  href={`/api/file-proxy?path=${encodeURIComponent(document.storagePath)}&userId=${document.userId}`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  download={document.name || 'download'} // Suggest original filename for download
                >
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
