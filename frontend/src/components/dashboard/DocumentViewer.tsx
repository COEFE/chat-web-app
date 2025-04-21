'use client';

import React, { useState, useEffect, useRef, MouseEvent, WheelEvent, useCallback } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import dynamic from 'next/dynamic';
import { Timestamp } from 'firebase/firestore';
import { 
  FileText, 
  X as XIcon, 
  Loader2, 
  RefreshCw, 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx'; // Import xlsx library
import mammoth from 'mammoth'; // Import mammoth for DOCX handling
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"; // Import Shadcn Tabs
import { useAuth } from '@/context/AuthContext'; // Import useAuth
import { doc, getDoc } from 'firebase/firestore'; // Import Firestore functions
import { db as clientDb } from '@/lib/firebaseConfig'; // Import client Firestore instance

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
  const viewerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // State for refresh button loading
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // Key to force re-renders
  const { user } = useAuth(); // Get user from auth context

  // Main function to fetch and process document content
  const fetchAndProcessContent = useCallback(async (docToLoad: MyDocumentData, currentRefreshKey: number) => {
    console.log('[fetchAndProcessContent] Starting to fetch and process content for document:', docToLoad);
    try {
      // Use the storage path directly from the document data
      const storagePath = docToLoad.storagePath;
      if (!storagePath) {
        throw new Error('Storage path is missing from document data.');
      }

      // Use our proxy API instead of direct Firebase Storage URL
      // Include userId to help with file lookup if needed
      const userId = docToLoad.userId || '';
      const proxyUrl = `/api/file-proxy?path=${encodeURIComponent(storagePath)}&userId=${encodeURIComponent(userId)}&v=${currentRefreshKey}`;
      console.log('[fetchAndProcessContent] Using proxy URL:', proxyUrl);
      console.log('[fetchAndProcessContent] Document metadata:', { 
        name: docToLoad.name, 
        storagePath: docToLoad.storagePath,
        userId: docToLoad.userId,
        contentType: docToLoad.contentType
      });
      
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      // PDF is handled by the dynamic PDFViewer component, no direct fetch/state update needed here
      // unless we want to explicitly track PDF state for some reason.

      // Handle different content types
      if (docToLoad.contentType === 'text/plain') {
        const text = await response.text();
        console.log('[fetchAndProcessContent] Setting text content:', text);
        setTextContent(text);
      } else if ([
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
          'text/csv' // .csv
        ].includes(docToLoad.contentType || '')) 
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
            
            console.log('[fetchAndProcessContent] Setting workbook data:', sheets);
            
            // --- NEW: Log specific cell value after refresh fetch --- 
            if (docToLoad && docToLoad.contentType?.includes('spreadsheet')) {
              try {
                const firstSheet = sheets[0];
                if (firstSheet) {
                  // Attempt to read A3 specifically (adjust if testing other cells)
                  const cellValueA3 = firstSheet.data?.[2]?.[0]; // Assuming A3 is row index 2, col index 0
                  const cellValueA2 = firstSheet.data?.[1]?.[0]; // Log A2 as well for comparison
                  console.log(`[fetchAndProcessContent] Parsed Cell A2 value: ${JSON.stringify(cellValueA2)}`);
                  console.log(`[fetchAndProcessContent] Parsed Cell A3 value: ${JSON.stringify(cellValueA3)}`);
                }
              } catch (e) {
                console.warn('[fetchAndProcessContent] Could not read specific cell for logging', e);
              }
            }
            // --- END NEW LOGGING --- 
            
            setWorkbookData(sheets);
            
            // Try to load the previously active sheet from localStorage
            let activeSheetToSet: string | null = null; // Default to null
            if (docToLoad?.id) {
              const savedSheet = localStorage.getItem(`activeSheet-${docToLoad.id}`);
              console.log(`[Excel Loading] Checking for saved active sheet for document ${docToLoad.id}: ${savedSheet || 'none found'}`);
              
              // Use saved sheet only if it's a valid non-empty string and exists in the current workbook
              if (typeof savedSheet === 'string' && savedSheet.length > 0 && sheets.some(sheet => sheet.sheetName === savedSheet)) {
                activeSheetToSet = savedSheet;
                console.log(`[Excel Loading] Restored active sheet: ${savedSheet}`);
              }
            }
            
            // If no valid saved sheet was found, use the first sheet if available
            if (activeSheetToSet === null && sheets.length > 0) {
              activeSheetToSet = sheets[0].sheetName;
              console.log(`[Excel Loading] No valid saved sheet found, using first sheet: ${activeSheetToSet}`);
              // Also save this to localStorage for consistency
              if (docToLoad?.id) {
                localStorage.setItem(`activeSheet-${docToLoad.id}`, activeSheetToSet);
              }
            }
            
            // Set the active sheet state
            console.log('[fetchAndProcessContent] Setting active sheet state to:', activeSheetToSet);
            setActiveSheetName(activeSheetToSet);

          } catch (error) {
            console.error('Error parsing Excel file:', error);
            throw new Error('Error parsing Excel file. The file may be corrupted or in an unsupported format.');
          }
        }
      } else if (docToLoad.contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Handle DOCX files using Mammoth.js
        const arrayBuffer = await response.arrayBuffer();
        try {
          const result = await mammoth.convertToHtml({ arrayBuffer });
          console.log('[fetchAndProcessContent] Setting DOCX HTML content:', result.value);
          setDocxHtml(result.value);
        } catch (mammothError) {
          console.error('Error converting DOCX:', mammothError);
          throw new Error(`Failed to convert DOCX file: ${mammothError instanceof Error ? mammothError.message : String(mammothError)}`);
        }
      } else if (docToLoad.contentType?.startsWith('image/')) {
        // Handle image files
        console.log('[fetchAndProcessContent] Setting image URL:', proxyUrl);
        setImageUrl(proxyUrl);
      }
      // PDF is handled by the dynamic PDFViewer component, no fetch needed here

    } catch (err) {
      console.error('[fetchAndProcessContent] Error:', err);
      setError(`Failed to load document content: ${err instanceof Error ? err.message : String(err)}`);
      // Rethrow the error so the caller knows it failed
      throw err; 
    } finally {
      console.log('[fetchAndProcessContent] Finished fetching and processing content.');
      setIsLoading(false);
    }
  }, []); // No dependencies, it relies on the passed docToLoad

  // Fetch content based on document type when document prop changes
  useEffect(() => {
    console.log('[DocumentViewer] Effect triggered to load initial content.');
    const initialLoad = async () => {
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
        await fetchAndProcessContent(document, 0);
      } finally {
        console.log('[DocumentViewer] Finished loading initial content.');
        setIsLoading(false);
      }
    };

    initialLoad();
  }, [document, fetchAndProcessContent]); // Re-run when the document prop changes or fetch function updates

  // --- Refresh Handler ---
  const handleRefresh = useCallback(async () => {
    console.log('[handleRefresh] Starting to refresh document content.');
    if (!document?.id || isRefreshing || isLoading) return; // Prevent refresh if no doc, or already loading/refreshing
    if (!user) {
      setError("Authentication required to refresh.");
      return;
    }

    setIsRefreshing(true);
    setError(null);

    try {
      // 1. Fetch latest document metadata directly from Firestore
      console.log(`[handleRefresh] Fetching latest metadata for document: ${document.id}`);
      
      // Get document reference
      const userId = user.uid;
      const docRef = doc(clientDb, 'users', userId, 'documents', document.id);
      
      // Fetch the document
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error('Document not found in database');
      }
      
      // Convert to our document data format with ID
      const latestDocumentData = {
        id: docSnap.id,
        ...docSnap.data(),
      } as MyDocumentData;
      
      console.log('[handleRefresh] Latest document data:', latestDocumentData);

      // 3. Re-fetch content using the latest metadata (potentially updated storagePath)
      await fetchAndProcessContent(latestDocumentData, refreshKey); // Use the reusable fetch/process logic

      // Increment refresh key to force re-render
      setRefreshKey(prevKey => prevKey + 1);
      
      // Optionally: Notify parent or show success toast
      console.log("Document refreshed successfully");

    } catch (error) {
      console.error('Error refreshing document:', error);
      setError(`Failed to refresh document: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      console.log('[handleRefresh] Finished refreshing document content.');
      setIsRefreshing(false);
    }
  }, [
    document?.id, 
    user?.uid, 
    isRefreshing, 
    isLoading, 
    fetchAndProcessContent, 
    setError, 
    setIsRefreshing,
    setRefreshKey,
    clientDb,
    workbookData, // Add workbookData as dependency to log its current state
    refreshKey // Add refreshKey as dependency
  ]);

  // Effect to set active sheet when workbookData changes
  useEffect(() => {
    console.log('[DocumentViewer] Effect triggered to set active sheet.');
    if (workbookData && workbookData.length > 0 && activeSheetName === null) {
      console.log('[DocumentViewer] Setting active sheet to first sheet:', workbookData[0].sheetName);
      setActiveSheetName(workbookData[0].sheetName);
    }
  }, [workbookData, activeSheetName]);

  // Effect to listen for excel-document-updated events
  useEffect(() => {
    console.log('[DocumentViewer] Effect triggered to listen for excel-document-updated events.');
    
    if (document?.id) {
      console.log(`[DocumentViewer] Setting up excel-document-updated event listener for document ${document.id}`);
      
      const handleExcelDocumentUpdated = () => {
        // Force a refresh key increment immediately to ensure UI update
        setRefreshKey(prevKey => {
          console.log(`[DocumentViewer] Incrementing refreshKey from ${prevKey} to ${prevKey + 1} due to excel-document-updated event`);
          return prevKey + 1;
        });
        
        // Also trigger the full refresh to get latest data
        handleRefresh();
      };
      
      // Add event listener
      window.addEventListener('excel-document-updated', handleExcelDocumentUpdated);
      
      // Remove event listener on cleanup
      return () => {
        window.removeEventListener('excel-document-updated', handleExcelDocumentUpdated);
      };
    }
  }, [document?.id, handleRefresh, setRefreshKey]);

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

  // Log workbookData just before rendering
  const firstSheetDataRender = workbookData && workbookData.length > 0 ? workbookData[0].data : null;
  const cellValueRender = firstSheetDataRender && firstSheetDataRender.length > 1 && firstSheetDataRender[1].length > 0 ? firstSheetDataRender[1][0] : 'N/A';
  console.log(`[DocumentViewer Render] Rendering with Cell A2 value: ${cellValueRender}`);

  return (
    <div className="flex flex-col h-full bg-background relative">
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
        <PDFViewer 
          fileUrl={`/api/file-proxy?path=${encodeURIComponent(document.storagePath)}&userId=${document.userId}&v=${refreshKey}`}
          fileName={document.name || 'Document'}
        />
      )}

      {/* Text Viewer */}
      {!isLoading && !error && isText && textContent && (
        <div className="flex-1 overflow-auto border rounded-md p-4 whitespace-pre-wrap font-mono text-sm">
          {textContent}
        </div>
      )}

      {/* Excel Viewer */}
      {!isLoading && !error && isSheet && workbookData && (
        // Log refresh key for debugging
        console.log(`[DocumentViewer] Rendering Excel viewer with refreshKey: ${refreshKey}`),
        <Tabs 
          key={`excel-viewer-${refreshKey}`} 
          defaultValue={activeSheetName || workbookData[0]?.sheetName || ''}
          className="flex-1 overflow-auto flex flex-col"
        >
            <div className="flex items-center justify-between mb-2">
              <TabsList>
                {workbookData.map((sheet) => (
                  <TabsTrigger 
                    key={sheet.sheetName} 
                    value={sheet.sheetName}
                    onClick={() => {
                      // Set active sheet name in state
                      setActiveSheetName(sheet.sheetName);
                      
                      // Store active sheet in localStorage with document ID as part of the key
                      if (document?.id) {
                        localStorage.setItem(`activeSheet-${document.id}`, sheet.sheetName);
                        console.log(`[SheetSelection] Set active sheet for document ${document.id}: ${sheet.sheetName}`);
                        
                        // Dispatch a custom event to notify other components of the active sheet change
                        const event = new CustomEvent('activeSheetChanged', {
                          detail: {
                            documentId: document.id,
                            sheetName: sheet.sheetName
                          }
                        });
                        window.dispatchEvent(event);
                      }
                    }}
                  >
                    {sheet.sheetName}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              <div className="flex items-center gap-2 pr-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRefresh}
                  className="h-7 px-2 text-xs"
                  disabled={isRefreshing || isLoading}
                  title="Refresh data"
                >
                  {isRefreshing ? (
                    <Loader2 className="h-3 w-3 sm:mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 sm:mr-1" />
                  )}
                  <span className="hidden sm:inline">
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                  </span>
                </Button>
                
                {document.storagePath && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    asChild
                    title="Download document"
                  >
                    <a 
                      href={`/api/file-proxy?path=${encodeURIComponent(document.storagePath)}&userId=${document.userId}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      download={document.name || 'document.xlsx'}
                      className="flex items-center"
                    >
                      <Download className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline">Download</span>
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {workbookData.map((sheet) => (
              <TabsContent 
                key={sheet.sheetName} 
                value={sheet.sheetName} 
                className="overflow-auto border rounded-md flex-1 h-full relative pb-8"
              >
                  <table className="border-collapse w-full mb-6" style={{ tableLayout: 'auto' }}>
                    <colgroup>
                      {/* Column for row headers */}
                      <col style={{ width: '30px', minWidth: '30px', maxWidth: '40px' }} />
                      
                      {/* Columns for data - generate one col element per column */}
                      {sheet.data[0]?.map((_: any, colIndex: number) => (
                        <col key={colIndex} style={{ minWidth: '35px' }} />
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
                              title={cell !== null && cell !== undefined ? String(cell) : ''}
                            >
                              {cell !== null && cell !== undefined ? String(cell) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="h-8"></div> {/* Extra bottom padding for scrolling */}
              </TabsContent>
            ))}
          </Tabs>
      )}
      
      {/* DOCX Viewer */}
      {!isLoading && !error && isDocx && docxHtml && (
        <div className="flex-1 overflow-auto border rounded-md relative">
          <div 
            className="p-4 prose prose-sm max-w-none pb-10"
            dangerouslySetInnerHTML={{ __html: docxHtml }}
          />
          <div className="h-8"></div> {/* Extra bottom padding for DOCX */}
        </div>
      )}
      
      {/* Image Viewer using react-zoom-pan-pinch */}
      {!isLoading && !error && isImage && imageUrl && (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-x-2 p-2 bg-muted/20 border-b justify-between">
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                asChild
              >
                <a 
                  href={`/api/file-proxy?path=${encodeURIComponent(document.storagePath)}&userId=${document.userId}`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  download={document.name || 'image.jpg'}
                  className="flex items-center"
                >
                  <Download className="h-4 w-4 mr-1" />
                  <span className="hidden xs:inline">Download</span>
                </a>
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <TransformWrapper
              initialScale={1}
              minScale={0.1}
              maxScale={5}
              limitToBounds={false}
              doubleClick={{ disabled: false }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <div className="absolute top-4 left-4 z-10 bg-background border rounded-md shadow-sm flex gap-2 p-1.5">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => zoomOut()}
                      title="Zoom Out"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => zoomIn()}
                      title="Zoom In"
                    >
                      <ZoomIn className="h-4 w-4" />
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
                        resetTransform();
                        setRotation(0);
                      }}
                      title="Reset"
                    >
                      Reset
                    </Button>
                  </div>
                  <TransformComponent
                    wrapperStyle={{
                      width: '100%', 
                      height: '100%'
                    }}
                    contentStyle={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      transform: `rotate(${rotation}deg)`
                    }}
                  >
                    <img 
                      src={imageUrl} 
                      alt={document.name || 'Document image'}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain'
                      }}
                    />
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
          </div>
        </div>
      )}

      {/* Unsupported format / No content */} 
      {!isLoading && !error && !isPreviewSupported && (
        <div className="flex-1 flex items-center justify-center border rounded-md bg-muted/10 py-6">
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
