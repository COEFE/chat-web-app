'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FileUpload } from '@/components/dashboard/FileUpload';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import DocumentViewer from '@/components/dashboard/DocumentViewer'; // Import the new DocumentViewer component
import ChatInterface from '@/components/dashboard/ChatInterface'; // Placeholder

// Import Firestore functions and db instance
import { db } from '@/lib/firebaseConfig';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot, // Real-time listener
  Timestamp,  // Firestore Timestamp type
  getDocs,
} from 'firebase/firestore';

// Define the structure of a document from Firestore
interface MyDocumentData {
  id: string; // Firestore document ID
  userId: string;
  name: string;
  storagePath: string;
  uploadedAt: Timestamp;
  contentType: string;
  status: string;
  downloadURL?: string;
  size?: number;
  createdAt?: Timestamp; // Add optional createdAt based on lint error
}

interface DocumentTableProps {
  documents: MyDocumentData[]; // Use specific type
  isLoading: boolean;
  error: string | null;
  onSelectDocument: (doc: MyDocumentData) => void; // Add callback prop
}

function DocumentTable({ documents, isLoading, error, onSelectDocument }: DocumentTableProps) {
  const formatDate = (timestamp: Timestamp | null | undefined): string => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString(); // Adjust formatting as needed
  };

  return (
    <Table>
      <TableCaption>A list of your uploaded documents.</TableCaption>
      {/* Custom hardcoded table header to avoid whitespace issues */}
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
                {/* Ensure we are accessing doc.name */}
                {/* Remove whitespace between TableCell components */}
                <TableCell className="font-medium">{doc.name}</TableCell><TableCell>{formatDate(doc.uploadedAt)}</TableCell><TableCell>{doc.status || 'N/A'}</TableCell><TableCell className="text-right">
                  {/* Call onSelectDocument when View button is clicked */}
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
  const { user, loading: authLoading, logout } = useAuth(); // Renamed loading to authLoading
  const router = useRouter();
  const [documents, setDocuments] = useState<MyDocumentData[]>([]); // State for documents
  const [isLoadingDocs, setIsLoadingDocs] = useState(true); // Loading state for documents
  const [errorDocs, setErrorDocs] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<MyDocumentData | null>(null); // State for selected doc

  // Callback for when upload completes to refresh list
  const handleUploadComplete = useCallback(() => {
    fetchDocuments();
  }, [user, router, authLoading]);

  // Handler to update the selected document state
  const handleSelectDocument = (doc: MyDocumentData | null) => {
    setSelectedDocument(doc);
  };

  useEffect(() => {
    fetchDocuments();
  }, [user]);

  const fetchDocuments = async () => {
    if (!user) return;

    setIsLoadingDocs(true);
    setErrorDocs(null);

    try {
      const docsRef = collection(db, 'users', user.uid, 'documents');
      const q = query(docsRef, orderBy('uploadedAt', 'desc'));

      const querySnapshot = await getDocs(q);
      const userDocuments = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<MyDocumentData, 'id'>), // Spread data, ensuring type safety
      }));
      setDocuments(userDocuments);
    } catch (error) {
      console.error("Error fetching documents: ", error);
      setErrorDocs('Failed to fetch documents');
    } finally {
      setIsLoadingDocs(false);
    }
  };

  // Show loading indicator while checking auth state
  if (authLoading) {
    return <div>Loading...</div>;
  }

  // Display loading state if auth is loading or user is not available yet
  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-muted/40">
      {/* Restore original header structure */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 py-4">
         <h1 className="text-2xl font-semibold">My Documents Dashboard</h1>
         <div className="ml-auto flex items-center gap-4">
            {user && <span className="text-sm text-muted-foreground">Welcome, {user.displayName || user.email}</span>}
            <Button variant="outline" size="sm" onClick={logout}>Logout</Button>
         </div>
      </header>

      {/* **MODIFIED**: Main content now uses ResizablePanelGroup */}
      <main className="flex-1 overflow-hidden p-6 pt-4"> {/* Ensure overflow-hidden for panels */}
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full rounded-lg border" // Use h-full for panel group
        >
          {/* === Left Panel: Document List / Viewer === */}
          <ResizablePanel defaultSize={60}> {/* Adjust size as needed */}
            <div className="flex h-full flex-col p-6 overflow-auto"> {/* Add overflow-auto */}
              {selectedDocument ? (
                // Document Viewer View
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Viewing: {selectedDocument.name}</h2>
                    <Button variant="outline" size="sm" onClick={() => handleSelectDocument(null)}>
                      Back to List
                    </Button>
                  </div>
                  <div className="flex-1 overflow-hidden"> {/* Ensure viewer area takes remaining space */}
                    <DocumentViewer document={selectedDocument} />
                  </div>
                </div>
              ) : (
                // Document List/Upload View
                <><h1 className="text-2xl font-semibold mb-4">My Documents</h1>
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle>Upload New Document</CardTitle>
                      <CardDescription>Drag & drop files here or click to select files.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FileUpload onUploadComplete={handleUploadComplete} />
                    </CardContent>
                  </Card>
                  <DocumentTable
                    documents={documents}
                    isLoading={isLoadingDocs}
                    error={errorDocs}
                    onSelectDocument={handleSelectDocument}
                  />
                </>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* === Right Panel: Chat Interface === */}
          <ResizablePanel defaultSize={40}> {/* Adjust size as needed */}
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
