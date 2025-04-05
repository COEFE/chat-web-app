'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableRow
} from "@/components/ui/table"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import DocumentViewer from '@/components/dashboard/DocumentViewer';
import ChatInterface from '@/components/dashboard/ChatInterface';
import { FileUpload } from '@/components/dashboard/FileUpload';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Import Firestore functions and db instance
import { db } from '@/lib/firebaseConfig';
import {
  collection,
  query,
  orderBy,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { MyDocumentData } from '@/types';

interface DocumentTableProps {
  documents: MyDocumentData[];
  isLoading: boolean;
  error: string | null;
  onSelectDocument: (doc: MyDocumentData | null) => void;
}

function DocumentTable({ documents, isLoading, error, onSelectDocument }: DocumentTableProps) {
  const formatDate = (timestamp: any): string => {
    // Handle null, undefined, or missing timestamp
    if (!timestamp) return 'N/A';
    
    // Handle server timestamp (which might be a different format)
    try {
      // If it's a Firestore Timestamp object
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleDateString();
      }
      
      // If it's a JavaScript Date object
      if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString();
      }
      
      // If it's a number (seconds or milliseconds since epoch)
      if (typeof timestamp === 'number') {
        // Assume milliseconds if > 10^12, otherwise seconds
        const date = timestamp > 10**12 
          ? new Date(timestamp) 
          : new Date(timestamp * 1000);
        return date.toLocaleDateString();
      }
      
      // If it's an ISO string or other string format
      if (typeof timestamp === 'string') {
        return new Date(timestamp).toLocaleDateString();
      }
    } catch (error) {
      console.error('Error formatting date:', error, timestamp);
    }
    
    // Fallback
    return 'Invalid Date';
  };

  // Prevent flashing content by maintaining previous documents while loading
  const displayDocuments = documents.length > 0 ? documents : [];
  
  return (
    <div>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      <Table>
        <TableCaption>A list of your uploaded documents.</TableCaption>
        <thead data-slot="table-header" className={"[&_tr]:border-b"}>
          <tr
            data-slot="table-row"
            className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
          >
            <th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[200px]">Name</th>
            <th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Upload Date</th>
            <th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Status</th>
            <th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-right">Actions</th>
          </tr>
        </thead>
        <TableBody>
          {isLoading && displayDocuments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center">
                <div className="flex items-center justify-center space-x-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <span>Loading documents...</span>
                </div>
              </TableCell>
            </TableRow>
          ) : displayDocuments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center">
                No documents uploaded yet.
              </TableCell>
            </TableRow>
          ) : (
            displayDocuments.map((doc) => {
              return (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.name}</TableCell>
                  <TableCell>{formatDate(doc.uploadedAt)}</TableCell>
                  <TableCell>{doc.status || 'N/A'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => onSelectDocument(doc)}>
                      View
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 ml-2">
                      Delete {/* TODO: Implement Delete */}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
          {isLoading && displayDocuments.length > 0 && (
            <TableRow>
              <TableCell colSpan={4} className="h-10 text-center bg-muted/20">
                <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <span>Refreshing...</span>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [documents, setDocuments] = useState<MyDocumentData[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [errorDocs, setErrorDocs] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<MyDocumentData | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    // Create a unique request ID to handle race conditions
    const requestId = Date.now().toString();
    currentRequestIdRef.current = requestId;
    
    if (authLoading) {
      console.log('fetchDocuments: Auth context is loading, skipping fetch.');
      return; // Don't fetch if auth state isn't ready
    }
    if (!user) {
      console.log('fetchDocuments: No user logged in, skipping fetch.');
      setErrorDocs('User not logged in');
      setIsLoadingDocs(false);
      return; // Don't fetch if user isn't logged in
    }

    console.log(`fetchDocuments: Fetching for user ${user.uid} with requestId ${requestId}`);
    setIsLoadingDocs(true);
    setErrorDocs(null);

    let token: string | null = null;
    try {
      token = await user.getIdToken();
    } catch (tokenError) {
      console.error("fetchDocuments: Failed to get ID token", tokenError);
      setErrorDocs('Authentication error. Please refresh.');
      setIsLoadingDocs(false);
      return;
    }

    if (!token) {
        console.error("fetchDocuments: Got null token after attempt");
        setErrorDocs('Authentication error. Please refresh.');
        setIsLoadingDocs(false);
        return;
    }

    try {
      // Fetch from the API route, including the Auth header
      const response = await fetch('/api/documents', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // Check if the request ID has changed (meaning a newer request has started)
      if (currentRequestIdRef.current !== requestId) {
        console.log(`[Request ${requestId}] Request ID changed, skipping response processing`);
        return;
      }

      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`; 
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorData.message || errorMsg;
        } catch (e) {
          // Ignore if response body isn't JSON
        }
        console.error(`[Request ${requestId}] Error fetching documents: ${errorMsg}`);
        setErrorDocs(`Failed to fetch documents: ${errorMsg}`);
        setIsLoadingDocs(false);
        return;
      }

      const data = await response.json();
      const fetchedDocs = data.documents || []; 
      console.log(`[Request ${requestId}] Fetched ${fetchedDocs.length} documents`);

      // Process documents with careful handling of timestamps
      const userDocuments = fetchedDocs.map((doc: any) => {
        let uploadedAt = doc.createdAt;
        if (uploadedAt && typeof uploadedAt === 'string') {
          try {
            uploadedAt = new Date(uploadedAt); // Convert string timestamp to Date
          } catch (e) { 
            console.warn(`Could not parse timestamp string: ${uploadedAt}`);
            uploadedAt = null; 
          }
        } else if (uploadedAt) { 
            // If it's already a Date or other type, use as is or handle accordingly
            // For now, nullify if not a string that can be parsed
            console.warn(`Unexpected timestamp format: ${typeof uploadedAt}`);
            uploadedAt = null;
        }

        return {
          id: doc.id,
          name: doc.filename || 'Untitled', // Use filename from API
          uploadedAt: uploadedAt,
        } as MyDocumentData; // Cast to your frontend type
      });
      
      console.log(`[Request ${requestId}] Processed ${userDocuments.length} documents with timestamp handling`);
      setDocuments(userDocuments);
    } catch (err) {
      console.error(`[Request ${requestId}] Error fetching documents:`, err);
      const message = (err instanceof Error) ? err.message : 'Unknown error';
      console.error(`[Request ${requestId}] Detailed error:`, err);
      setErrorDocs(`Failed to fetch documents: ${message}`);
    } finally {
      setIsLoadingDocs(false);
      console.log(`[Request ${requestId}] Fetch documents complete`);
    }
  }, [user]);

  const handleUploadComplete = useCallback(() => {
    console.log("Upload complete signal received, fetching documents...");
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, router, authLoading]);

  // Single useEffect to handle document fetching
  useEffect(() => {
    if (user && !authLoading) {
      console.log('Triggering document fetch on user authentication');
      fetchDocuments();
    }
  }, [user, authLoading, fetchDocuments]);

  // Handler for the existing DocumentList component (if used)
  const handleSelectDocument = (doc: MyDocumentData | null) => {
    console.log("Selected Document from List:", doc);
    setSelectedDocument(doc); // Keep this for DocumentViewer perhaps
    setSelectedDocumentId(doc?.id ?? null);
    // setView('chat'); // Switch view to chat interface
  };

  // New handler specifically for the Shadcn Select component's onValueChange
  const handleDocumentSelectChange = (value: string) => {
    console.log("Selected Document ID from Select:", value);
    setSelectedDocumentId(value);
    // Optionally, find the full document object if needed elsewhere
    const fullDoc = documents.find(d => d.id === value);
    setSelectedDocument(fullDoc || null);
  };

  if (authLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 py-4">
        <h1 className="text-2xl font-semibold">My Documents Dashboard</h1>
        <div className="ml-auto flex items-center gap-4">
          {user && <span className="text-sm text-muted-foreground">Welcome, {user.displayName || user.email}</span>}
          <Button variant="outline" size="sm" onClick={logout}>Logout</Button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-6 pt-4">
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full rounded-lg border"
        >
          <ResizablePanel defaultSize={60}>
            <div className="flex h-full flex-col p-6 overflow-auto">
              {selectedDocument ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Viewing: {selectedDocument.name}</h2>
                    <Button variant="outline" size="sm" onClick={() => handleSelectDocument(null)}>
                      Back to List
                    </Button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {/* Explicit check to ensure selectedDocument is not null */}
                    {selectedDocument && <DocumentViewer document={selectedDocument} />}
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-semibold mb-4">My Documents</h1>
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle>Upload New Document</CardTitle>
                      <CardDescription>Drag & drop files here or click to select files.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FileUpload
                        onUploadComplete={handleUploadComplete}
                      />
                    </CardContent>
                  </Card>
                  <DocumentTable
                    documents={documents}
                    isLoading={isLoadingDocs}
                    error={errorDocs}
                    onSelectDocument={(doc: MyDocumentData | null) => handleSelectDocument(doc)}
                  />
                  {documents.length > 0 ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>Select Document</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {/* Use the new handler here */}
                        <Select onValueChange={handleDocumentSelectChange} value={selectedDocumentId ?? undefined}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a document to chat with..." />
                          </SelectTrigger>
                          <SelectContent>
                            {documents.map((doc) => (
                              <SelectItem key={doc.id} value={doc.id}>
                                {doc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </CardContent>
                    </Card>
                  ) : (
                    <p>No documents uploaded yet. Upload a file to start chatting.</p>
                  )}
                </>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={40}>
            <div className="flex h-full flex-col p-6">
              {selectedDocumentId ? (
                <ChatInterface documentId={selectedDocumentId} />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Select a document to start chatting.
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
