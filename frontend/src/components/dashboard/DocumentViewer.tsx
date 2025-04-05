'use client';

import React, { useState, useEffect, useRef, MouseEvent, WheelEvent } from 'react';
import dynamic from 'next/dynamic';
import { Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Loader2, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import * as XLSX from 'xlsx'; // Import xlsx library
import mammoth from 'mammoth'; // Import mammoth for DOCX handling
import { HotTable } from '@handsontable/react'; // Import HotTable
import 'handsontable/dist/handsontable.full.min.css'; // Import Handsontable CSS
import { registerAllModules } from 'handsontable/registry'; // Needed for features
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Import Shadcn Tabs

// Register Handsontable modules
registerAllModules();

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
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);
  // Reference to the Handsontable container
  const hotTableRef = useRef<HTMLDivElement>(null);
  const [hotInstance, setHotInstance] = useState<any>(null);
  
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
          
          // Process all sheets
          const sheetNames = workbook.SheetNames;
          if (sheetNames.length > 0) {
            const allSheetData = sheetNames.map(sheetName => {
              const worksheet = workbook.Sheets[sheetName];
              // Use header: 1 to get array of arrays, better for Handsontable
              const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
              return { sheetName, data };
            });
            setWorkbookData(allSheetData);
            setActiveSheetName(sheetNames[0]); // Set first sheet as active
          } else {
            setError('Excel file contains no sheets.');
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

  // Effect to handle Handsontable initialization and configuration
  useEffect(() => {
    if (workbookData && activeSheetName && hotInstance) {
      // Force Handsontable to render properly with multiple attempts
      // This addresses the common issue with Handsontable not rendering all columns
      // when initialized in a hidden container or when switching between tabs
      const renderWithRetry = (attempt = 1, maxAttempts = 5) => {
        console.log(`Rendering Handsontable attempt ${attempt}/${maxAttempts}`);
        
        // Ensure all columns have proper width
        const columnCount = hotInstance.countCols();
        console.log(`Setting widths for ${columnCount} columns`);
        
        for (let i = 0; i < columnCount; i++) {
          hotInstance.setColWidth(i, 120); // Set explicit width for each column
        }
        
        // Force render to apply column widths
        hotInstance.render();
        
        // Check if we need to retry (if columns aren't properly rendered)
        if (attempt < maxAttempts) {
          setTimeout(() => {
            // Get the actual rendered column count from the DOM
            const renderedCols = hotInstance.rootElement.querySelectorAll('.ht_master .htCore thead tr th').length;
            console.log(`Currently rendered columns: ${renderedCols} of ${columnCount}`);
            
            // If not all columns are rendered, retry
            if (renderedCols < columnCount) {
              renderWithRetry(attempt + 1, maxAttempts);
            }
          }, 200 * attempt); // Increasing delay with each attempt
        }
      };
      
      // Start the render process
      renderWithRetry();
      
      // Additional render when window is resized to ensure proper display
      const handleResize = () => {
        if (hotInstance) {
          hotInstance.render();
        }
      };
      
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [workbookData, activeSheetName, hotInstance]);

  // Define supported types for clarity
  const isPdf = document?.contentType === 'application/pdf';
  const isText = document?.contentType === 'text/plain';
  const isSheet = document && [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
      'application/vnd.ms-excel', 
      'text/csv'
    ].includes(document.contentType);
  const isDocx = document?.contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isImage = document && ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(document.contentType);
  const isPreviewSupported = isPdf || isText || isSheet || isDocx || isImage;

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
      {!isLoading && !error && isPdf && document.storagePath && (
        <PDFViewer documentUrl={`/api/file-proxy?path=${encodeURIComponent(document.storagePath)}`} />
      )}

      {/* Text Viewer */}
      {!isLoading && !error && isText && textContent && (
        <div className="flex-1 overflow-auto border rounded-md p-4 whitespace-pre-wrap font-mono text-sm">
          {textContent}
        </div>
      )}

      {/* Excel/CSV Viewer using Handsontable - Simplified Configuration */}
      {!isLoading && !error && isSheet && workbookData && activeSheetName && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs value={activeSheetName} onValueChange={setActiveSheetName} className="flex-shrink-0">
            <TabsList className="bg-muted p-1 rounded-t-md h-auto justify-start overflow-x-auto">
              {workbookData.map((sheet) => (
                <TabsTrigger 
                  key={sheet.sheetName} 
                  value={sheet.sheetName}
                  className="text-xs px-2 py-1 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  {sheet.sheetName}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div 
            ref={hotTableRef}
            className="flex-1 border border-t-0 rounded-b-md"
            style={{ 
              height: '500px', // Fixed height for stability
              width: '100%',
              overflow: 'hidden',
              visibility: 'visible', // Ensure visibility for proper rendering
              position: 'relative' // Needed for proper positioning
            }}
          >
            {/* Robust Handsontable configuration with fixed dimensions */}
            <HotTable
              data={workbookData.find(sheet => sheet.sheetName === activeSheetName)?.data || []}
              colHeaders={true}
              rowHeaders={true}
              width="100%"
              height="100%"
              colWidths={120} // Fixed column width
              autoColumnSize={false} // Disable auto sizing for better performance
              manualColumnResize={true} // Allow manual column resizing
              contextMenu={true} // Enable context menu for Excel-like functionality
              licenseKey="non-commercial-and-evaluation"
              fixedColumnsLeft={0} // No fixed columns
              stretchH="none" // Don't stretch columns
              wordWrap={false} // No word wrapping
              preventOverflow="horizontal" // Prevent horizontal overflow
              outsideClickDeselects={false} // Better UX for selection
              afterGetColHeader={(col: number, TH: HTMLTableCellElement) => {
                // Ensure header cells have minimum width
                if (TH) {
                  TH.style.minWidth = '120px';
                }
              }}
              beforeRender={() => {
                // Before rendering, ensure the container is visible to the browser
                if (hotTableRef.current) {
                  hotTableRef.current.style.visibility = 'visible';
                }
              }}
              afterRender={() => {
                // Get the Handsontable instance
                if (!hotInstance && hotTableRef.current) {
                  const instance = (hotTableRef.current as any).__hotInstance;
                  if (instance) {
                    setHotInstance(instance);
                    
                    // Log the number of columns for debugging
                    console.log(`Handsontable rendered with ${instance.countCols()} columns`);
                    
                    // Force another render after a short delay
                    setTimeout(() => {
                      instance.render();
                    }, 50);
                  }
                }
              }}
            />
            <style jsx global>{`
              /* Force horizontal scrollbar to be visible */
              .handsontable .wtHolder {
                overflow-x: auto !important;
              }
              /* Ensure minimum column width */
              .handsontable th, .handsontable td {
                min-width: 120px !important;
              }
              /* Make sure all columns are rendered */
              .handsontable .htCore {
                width: auto !important;
                table-layout: fixed !important;
              }
              /* Ensure column headers are visible */
              .handsontable .htCore thead th {
                display: table-cell !important;
                visibility: visible !important;
              }
              /* Improve scrollbar appearance */
              .handsontable ::-webkit-scrollbar {
                height: 10px;
                width: 10px;
              }
              .handsontable ::-webkit-scrollbar-track {
                background: #f1f1f1;
              }
              .handsontable ::-webkit-scrollbar-thumb {
                background: #888;
                border-radius: 5px;
              }
              .handsontable ::-webkit-scrollbar-thumb:hover {
                background: #555;
              }
            `}</style>
          </div>
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
                setIsDragging(true);
                setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
              }
            }}
            onMouseMove={(e: MouseEvent) => {
              if (isDragging) {
                setPosition({
                  x: e.clientX - dragStart.x,
                  y: e.clientY - dragStart.y
                });
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
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
                transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                cursor: isDragging ? 'grabbing' : 'grab'
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
            <p className="text-muted-foreground mb-2">Preview not available for {document?.contentType || 'this file type'}</p>
            {document?.storagePath && (
              <Button asChild variant="outline">
                <a href={`/api/file-proxy?path=${encodeURIComponent(document.storagePath)}`} target="_blank" rel="noopener noreferrer">
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
