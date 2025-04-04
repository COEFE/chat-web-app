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
  const formatDate = (timestamp: Timestamp | null | undefined): string => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString();
  };

  return (
    <Table>
      <TableCaption>A list of your uploaded documents.</TableCaption>
      <thead data-slot="table-header" className={"[&_tr]:border-b"}>
        <tr
          data-slot="table-row"
          className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
        ><th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[200px]">Name</th><th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Upload Date</th><th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Status</th><th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-right">Actions</th></tr>
      </thead>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={4} className="h-24 text-center">
              Loading documents...
            </TableCell>
          </TableRow>
        ) : documents.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="h-24 text-center">
              No documents uploaded yet.
            </TableCell>
          </TableRow>
        ) : (
          documents.map((doc) => {
            return (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">{doc.name}</TableCell><TableCell>{formatDate(doc.uploadedAt)}</TableCell><TableCell>{doc.status || 'N/A'}</TableCell><TableCell className="text-right">
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
      </TableBody>
    </Table>
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
    if (!user) return;

    setIsLoadingDocs(true);
    setErrorDocs(null);

    try {
      const q = query(collection(db, 'users', user.uid, 'documents'), orderBy('uploadedAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const userDocuments = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<MyDocumentData, 'id'>),
      }));
      setDocuments(userDocuments);
    } catch (err) {
      console.error("Error fetching documents: ", err);
      const message = (err instanceof Error) ? err.message : 'Unknown error';
      setErrorDocs(`Failed to fetch documents: ${message}`);
    } finally {
      setIsLoadingDocs(false);
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

  useEffect(() => {
    if (user && !isLoadingDocs && !errorDocs) {
      fetchDocuments();
    }
  }, [user, fetchDocuments, isLoadingDocs, errorDocs]);

  const handleSelectDocument = (doc: MyDocumentData | null) => {
    console.log("Selected Document:", doc);
    setSelectedDocument(doc);
    // setView('chat'); // Switch view to chat interface
  };

  useEffect(() => {
    fetchDocuments();
  }, [user, fetchDocuments]);

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
