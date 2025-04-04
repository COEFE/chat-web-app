'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

  const fetchDocuments = useCallback(async () => {
    // Create a unique request ID to handle race conditions
    const requestId = Date.now().toString();
    
    if (!user) {
      console.log('No user available for fetching documents');
      return;
    }

    console.log(`[Request ${requestId}] Attempting to fetch documents for user:`, user.uid);
    setIsLoadingDocs(true);
    setErrorDocs(null);

    try {
      // Force token refresh to ensure we have the latest authentication
      console.log(`[Request ${requestId}] Refreshing auth token before querying Firestore`);
      await user.getIdToken(true);
      console.log(`[Request ${requestId}] Token refreshed successfully`);
      
      // Log the full path we're querying
      const path = `users/${user.uid}/documents`;
      console.log(`[Request ${requestId}] Querying Firestore path: ${path}`);
      
      // Get the documents collection
      const collectionRef = collection(db, 'users', user.uid, 'documents');
      
      // Try a simple query first without any ordering
      let q = query(collectionRef);
      const initialSnapshot = await getDocs(q);
      console.log(`[Request ${requestId}] Initial query returned ${initialSnapshot.docs.length} documents without ordering`);
      
      // If documents exist, try with ordering if possible
      let querySnapshot = initialSnapshot;
      if (initialSnapshot.docs.length > 0) {
        // Check if any documents have the uploadedAt field
        const hasUploadedAt = initialSnapshot.docs.some(doc => doc.data().uploadedAt);
        
        if (hasUploadedAt) {
          console.log(`[Request ${requestId}] Documents with uploadedAt exist, trying with orderBy`);
          q = query(collectionRef, orderBy('uploadedAt', 'desc'));
          querySnapshot = await getDocs(q);
          console.log(`[Request ${requestId}] Ordered query returned ${querySnapshot.docs.length} documents`);
        } else {
          console.log(`[Request ${requestId}] No documents have uploadedAt field, skipping ordering`);
        }
      }
    
      // Process documents with careful handling of timestamps
      const userDocuments = querySnapshot.docs.map(doc => {
        const data = doc.data();
        let uploadedAt = data.uploadedAt;
        
        // Handle different timestamp formats
        if (uploadedAt) {
          if (typeof uploadedAt.toDate === 'function') {
            // Firestore Timestamp
            uploadedAt = uploadedAt.toDate();
          } else if (uploadedAt instanceof Date) {
            // Already a Date object
            uploadedAt = uploadedAt;
          } else if (typeof uploadedAt === 'number') {
            // Timestamp in milliseconds
            uploadedAt = new Date(uploadedAt);
          } else if (typeof uploadedAt === 'string') {
            // ISO string or other date string
            uploadedAt = new Date(uploadedAt);
          }
        }
        
        return {
          id: doc.id,
          ...data,
          uploadedAt: uploadedAt || null
        } as MyDocumentData;
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

  const handleSelectDocument = (doc: MyDocumentData | null) => {
    console.log("Selected Document:", doc);
    setSelectedDocument(doc);
    // setView('chat'); // Switch view to chat interface
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
                </>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={40}>
            <div className="flex h-full flex-col p-6">
              {selectedDocument ? (
                <ChatInterface document={selectedDocument} />
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
