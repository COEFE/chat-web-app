'use client';

import { Loader2, Trash2, FileText, MoreHorizontal, RefreshCw, Maximize2, Minimize2, Eye, EyeOff, Folder, FolderPlus, Move } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
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
import {
  collection,
  query,
  orderBy,
  getDocs,
  where,
  Timestamp
} from 'firebase/firestore';
import { db, createFolderAPI, functionsInstance } from '@/lib/firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { MyDocumentData, FolderData, FilesystemItem } from '@/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoveDocumentModal } from '@/components/dashboard/MoveDocumentModal';

interface DocumentTableProps {
  items: FilesystemItem[];
  isLoading: boolean;
  error: string | null;
  onSelectItem: (item: FilesystemItem | null) => void;
  onDeleteDocument: (docId: string) => Promise<void>;
  onFolderClick: (folderId: string, folderName: string) => void;
  onMoveClick: (docId: string, docName: string) => void;
}

function DocumentTable({ items, isLoading, error, onSelectItem, onDeleteDocument, onFolderClick, onMoveClick }: DocumentTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    
    try {
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleDateString();
      }
      
      if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString();
      }
      
      if (typeof timestamp === 'number') {
        const date = timestamp > 10**12 
          ? new Date(timestamp) 
          : new Date(timestamp * 1000);
        return date.toLocaleDateString();
      }
      
      if (typeof timestamp === 'string') {
        return new Date(timestamp).toLocaleDateString();
      }
    } catch (error) {
      console.error('Error formatting date:', error, timestamp);
    }
    
    return 'Invalid Date';
  };

  const displayItems = items.length > 0 ? items : [];

  return (
    <div>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      <Table>
        <TableCaption>A list of your uploaded documents and folders.</TableCaption>
        <thead data-slot="table-header" className={"[&_tr]:border-b"}>
          <tr
            data-slot="table-row"
            className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
          >
            <th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-8"> </th>
            <th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[200px]">Name</th>
            <th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Date Modified/Created</th>
            <th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Status</th>
            <th data-slot="table-head" className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-right">Actions</th>
          </tr>
        </thead>
        <TableBody>
          {isLoading && displayItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center"> 
                <div className="flex items-center justify-center space-x-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <span>Loading items...</span>
                </div>
              </TableCell>
            </TableRow>
          ) : displayItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center"> 
                This folder is empty.
              </TableCell>
            </TableRow>
          ) : (
            displayItems.map((item) => {
              if (item.type === 'folder') {
                return (
                  <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => {
                    onFolderClick(item.id, item.name);
                  }}>
                    <TableCell>
                      <Folder className="h-4 w-4 text-blue-500" />
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.name}
                    </TableCell>
                    <TableCell>{formatDate(item.updatedAt)}</TableCell>
                    <TableCell>N/A</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" disabled> 
                        Options
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              } else {
                const doc = item;
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <FileText className="h-4 w-4 text-gray-500" />
                    </TableCell>
                    <TableCell className="font-medium">
                      {doc.name}
                    </TableCell>
                    <TableCell>{formatDate(doc.updatedAt)}</TableCell>
                    <TableCell>{doc.status || 'N/A'}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onSelectItem(doc)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onMoveClick(doc.id, doc.name)}>
                            <Move className="mr-2 h-4 w-4" />
                            Move
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <div className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-red-600 hover:text-red-700">
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete</span>
                              </div>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the document "{doc.name}". This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
                                    e.preventDefault();
                                    setDeletingId(doc.id);
                                    setIsDeleting(true);
                                    try {
                                      await onDeleteDocument(doc.id);
                                      toast({
                                        title: "Document deleted",
                                        description: `${doc.name} has been successfully deleted.`,
                                      });
                                    } catch (error) {
                                      console.error('Error deleting document:', error);
                                      toast({
                                        variant: "destructive",
                                        title: "Error",
                                        description: `Failed to delete ${doc.name}. Please try again. Error: ${error instanceof Error ? error.message : String(error)}`,
                                      });
                                    } finally {
                                      setIsDeleting(false);
                                      setDeletingId(null);
                                    }
                                  }}
                                  disabled={isDeleting && deletingId === doc.id}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {isDeleting && deletingId === doc.id ? 'Deleting...' : 'Delete'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              }
            })
          )}
          {isLoading && displayItems.length > 0 && (
            <TableRow>
              <TableCell colSpan={5} className="h-10 text-center bg-muted/20">
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

function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<MyDocumentData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [filesystemItems, setFilesystemItems] = useState<FilesystemItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Home' }]);
  const [selectedDocument, setSelectedDocument] = useState<MyDocumentData | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isViewerVisible, setIsViewerVisible] = useState(true);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [movingDocument, setMovingDocument] = useState<{ id: string; name: string } | null>(null);
  const [availableFolders, setAvailableFolders] = useState<FolderData[]>([]);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);

  const panelGroupRef = useRef<any>(null);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  async function fetchItems(folderId: string | null = null) {
    if (authLoading) {
      console.log('Auth is loading, skipping fetch.');
      return;
    }
    if (!user) {
      console.log('User not logged in, redirecting.');
      router.push('/login');
      return;
    }

    console.log(`Fetching items for user: ${user.uid}, folderId: ${currentFolderId}`);
    setLoadingDocs(true);
    setDocsError(null);
    setFilesystemItems([]);

    try {
      const userId = user.uid;

      const foldersQuery = query(
        collection(db, 'users', userId, 'folders'),
        where('parentFolderId', '==', currentFolderId),
        orderBy('name', 'asc')
      );
      const folderSnapshot = await getDocs(foldersQuery);
      const fetchedFolders: FolderData[] = folderSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as FolderData));
      const folderItems: FilesystemItem[] = fetchedFolders.map(f => ({ ...f, type: 'folder' }));
      console.log('Fetched Folders:', fetchedFolders);

      const documentsQuery = query(
        collection(db, 'users', userId, 'documents'),
        where('folderId', '==', currentFolderId),
        orderBy('name', 'asc')
      );
      const documentSnapshot = await getDocs(documentsQuery);
      const fetchedDocs: MyDocumentData[] = documentSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        uploadedAt: doc.data().uploadedAt as Timestamp,
        createdAt: doc.data().createdAt as Timestamp,
        updatedAt: doc.data().updatedAt as Timestamp,
      } as MyDocumentData));
      const documentItems: FilesystemItem[] = fetchedDocs.map(d => ({ ...d, type: 'document' }));
      console.log('Fetched Documents:', fetchedDocs);

      setFilesystemItems([...folderItems, ...documentItems]);

    } catch (error) {
      console.error('Error fetching documents or folders:', error);
      setDocsError(`Failed to load items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleSelectDocument = (doc: MyDocumentData | null) => {
    console.log('Document selected:', doc);
    setSelectedDocument(doc);
    if (doc && !isViewerVisible) {
      setIsViewerVisible(true);
    }
  };

  const handleSelectItem = (item: FilesystemItem | null) => {
    if (item?.type === 'document') {
      handleSelectDocument(item);
    } else if (item?.type === 'folder') {
      console.log('Folder selected (for info):', item);
      setSelectedDocument(null);
    } else {
      handleSelectDocument(null);
    }
  };

  const handleFolderClick = useCallback((folderId: string, folderName: string) => {
    console.log(`Navigating into folder: ${folderName} (${folderId})`);
    setCurrentFolderId(folderId);
    setBreadcrumbs(prev => [...prev, { id: folderId, name: folderName }]);
    setSelectedDocument(null);
  }, [setCurrentFolderId, setBreadcrumbs]);

  const handleBreadcrumbClick = (index: number) => {
    const targetFolder = breadcrumbs[index];
    console.log(`Navigating via breadcrumb to: ${targetFolder.name} (${targetFolder.id})`);
    setCurrentFolderId(targetFolder.id);
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setSelectedDocument(null);
  };

  const handleUploadSuccess = () => {
    console.log("Upload complete signal received, refreshing current folder...");
    triggerRefresh();
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!user) {
      console.error('No user available for deleting document');
      throw new Error('Authentication required');
    }
    
    let token: string | null = null;
    try {
      token = await user.getIdToken();
    } catch (tokenError) {
      console.error("Failed to get ID token for delete operation", tokenError);
      throw new Error('Authentication error. Please refresh and try again.');
    }
    
    try {
      const response = await fetch(`/api/documents?id=${docId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorData.message || errorMsg;
        } catch (e) {
          // Ignore if response body isn't JSON
        }
        console.error(`Error deleting document: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      setFilesystemItems(prevItems => prevItems.filter(item => item.id !== docId));
      
      if (selectedDocument?.id === docId) {
        setSelectedDocument(null);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error in handleDeleteDocument:', error);
      throw error;
    }
  };

  const handleCreateFolder = async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to create a folder." });
      return;
    }
    if (!newFolderName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Folder name cannot be empty." });
      return;
    }

    setIsCreatingFolder(true);
    try {
      const payload = { name: newFolderName.trim(), parentFolderId: currentFolderId };
      const result = await createFolderAPI(payload);
      if (result.success) {
        toast({ title: "Folder created", description: `Folder "${newFolderName.trim()}" created successfully.` });
        setShowCreateFolderDialog(false);
        setNewFolderName("");
        triggerRefresh();
      } else {
        toast({ variant: "destructive", title: "Error", description: "Failed to create folder." });
      }
    } catch (error) {
      console.error("Error creating folder:", error);
      toast({ variant: "destructive", title: "Error", description: `Failed to create folder: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  async function fetchAllFolders() {
    if (!user) return;
    console.log(`Fetching all folders for user: ${user.uid}`);
    try {
      setIsLoadingFolders(true); // Start loading
      const foldersRef = collection(db, `users/${user.uid}/folders`);
      const q = query(foldersRef, orderBy('name', 'asc'));
      const querySnapshot = await getDocs(q);
      // Ensure createdAt/updatedAt are handled if needed, though FolderData might not require them here
      const fetchedFolders: FolderData[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as FolderData));
      setAvailableFolders(fetchedFolders);
    } catch (error) {
      console.error('Error fetching all folders:', error);
      toast({ variant: "destructive", title: "Error", description: "Could not load folders for moving." });
      setAvailableFolders([]); // Reset on error
    } finally {
      setIsLoadingFolders(false); // Stop loading regardless of outcome
    }
  };

  const handleOpenMoveModal = (docId: string, docName: string) => {
    // Fetch all folders if not already fetched (or fetch fresh)
    if (availableFolders.length === 0) {
      fetchAllFolders(); // Fetch folders if needed
    }
    setMovingDocument({ id: docId, name: docName });
    setIsMoveModalOpen(true);
  };

  const handleMoveConfirm = useCallback(async (targetFolderId: string | null) => {
    if (!movingDocument) return;

    console.log(`Attempting to move ${movingDocument.id} to ${targetFolderId}`);
    try {
      // Ensure 'functions' is imported and initialized correctly in firebaseConfig
      const moveDocFunc = httpsCallable(functionsInstance, 'moveDocument'); 
      await moveDocFunc({ 
        documentId: movingDocument.id, 
        targetFolderId: targetFolderId // Pass null for root
      });
      setIsMoveModalOpen(false); 
      setMovingDocument(null);
      toast({ title: "Success", description: `Moved '${movingDocument.name}' successfully.` });
      fetchAllFolders(); // Refresh the list of available folders
      fetchItems(currentFolderId); // Refresh the current folder view
    } catch (error: any) {
      console.error("Error moving document:", error);
      // Attempt to get a more specific error message
      const message = error?.details?.message || error?.message || 'An unknown error occurred';
      toast({ 
        variant: "destructive", 
        title: "Error Moving Document", 
        description: `Failed to move document: ${message}` 
      });
    }
  }, [
    movingDocument, 
    functionsInstance, 
    toast, 
    currentFolderId, 
    setIsMoveModalOpen, 
    setMovingDocument
  ]);

  useEffect(() => {
    if (authLoading) {
      console.log('Auth is loading, skipping fetch.');
      return;
    }
    if (!user) {
      console.log('User not logged in, redirecting.');
      router.push('/login');
      return;
    }

    console.log(`Fetching items for user: ${user.uid}, folderId: ${currentFolderId}`);
    setLoadingDocs(true);
    setDocsError(null);
    setFilesystemItems([]);

    fetchItems();

  }, [user, authLoading, router, currentFolderId, refreshTrigger, setLoadingDocs, setDocsError, setFilesystemItems]);

  if (authLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 py-4">
        <h1 className="text-xl font-semibold whitespace-nowrap">My Documents</h1>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Welcome, {user.displayName || user.email}</span>
          <Button variant="outline" size="sm" onClick={logout}>Logout</Button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-6 pt-4">
        <div className="mb-4 text-sm text-muted-foreground">
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.id ?? 'root'}>
              {index > 0 && <span className="mx-1">/</span>}
              {index < breadcrumbs.length - 1 ? (
                <button
                  onClick={() => handleBreadcrumbClick(index)}
                  className="hover:underline hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
                >
                  {crumb.name}
                </button>
              ) : (
                <span className="font-medium text-foreground">{crumb.name}</span>
              )}
            </span>
          ))}
        </div>

        <div className="flex h-full flex-col">
          {selectedDocument && (
            <div className="flex justify-end mb-2 gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsMaximized(prev => !prev)}
                title={isMaximized ? "Exit full screen" : "Full screen"}
              >
                {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsViewerVisible(prev => !prev)}
                title={isViewerVisible ? "Hide document viewer" : "Show document viewer"}
              >
                {isViewerVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          )}
          
          <div className="flex-1 rounded-lg border overflow-hidden">
            {isMaximized ? (
              <div className="h-full">
                {selectedDocument ? (
                  <div className="flex h-full flex-col p-6 overflow-auto">
                    <div className="flex h-full flex-col">
                      <div className="flex-1 overflow-hidden">
                        {selectedDocument && <DocumentViewer document={selectedDocument}/>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Select a document to view.
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full">
                <div className="w-[70%] border-r">
                  <div className="flex h-full flex-col p-6 overflow-auto">
                    {selectedDocument ? (
                      <div className="flex h-full flex-col">
                        <div className="flex-1 overflow-hidden">
                          {selectedDocument && <DocumentViewer document={selectedDocument}/>}
                        </div>
                      </div>
                    ) : (
                      <>
                        <Card className="mb-6">
                          <CardHeader>
                            <CardTitle>Upload New Document</CardTitle>
                            <CardDescription>Drag & drop files here or click to select files. Files will be added to the current folder: <span className='font-medium'>{breadcrumbs[breadcrumbs.length - 1]?.name ?? 'Home'}</span></CardDescription>
                          </CardHeader>
                          <CardContent>
                            <FileUpload
                              onUploadComplete={handleUploadSuccess}
                              currentFolderId={currentFolderId}
                            />
                          </CardContent>
                        </Card>
                        {/* Conditional Rendering for Document Table */}
                        {loadingDocs ? (
                          <div className="flex items-center justify-center p-10">
                            <Loader2 className="h-6 w-6 animate-spin mr-2" />
                            <span>Loading items...</span>
                          </div>
                        ) : docsError ? (
                          <div className="text-red-600 p-4 text-center border border-red-300 rounded-md bg-red-50">
                            {docsError}
                          </div>
                        ) : (
                          <>
                            <DocumentTable
                              items={filesystemItems}
                              isLoading={false} // Handled outside
                              error={null}      // Handled outside
                              onSelectItem={handleSelectItem}
                              onDeleteDocument={handleDeleteDocument}
                              onFolderClick={handleFolderClick}
                              onMoveClick={handleOpenMoveModal}
                            />
                            {filesystemItems.length === 0 && (
                              <p className="mt-4 text-center text-muted-foreground">No documents or folders uploaded yet. Upload a file or create a folder to start.</p>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                
                <div className="w-[30%]">
                  <div className="flex h-full flex-col p-6">
                    {selectedDocument ? (
                       <ChatInterface documentId={selectedDocument.id} document={selectedDocument} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        Select a document to start chatting.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" onClick={() => setShowCreateFolderDialog(true)}>
            <FolderPlus className="h-4 w-4 mr-2" />
            New Folder
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for your new folder.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="folder-name" className="text-right">
                Name
              </Label>
              <Input 
                id="folder-name" 
                value={newFolderName} 
                onChange={(e) => setNewFolderName(e.target.value)} 
                className="col-span-3" 
                placeholder="My Project Files"
                disabled={isCreatingFolder}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateFolderDialog(false)} disabled={isCreatingFolder}>Cancel</Button>
            <Button 
              type="button" 
              onClick={handleCreateFolder} 
              disabled={isCreatingFolder || !newFolderName.trim()}
            >
              {isCreatingFolder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isCreatingFolder ? 'Creating...' : 'Create Folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Document Modal (Render conditionally) */}
      <MoveDocumentModal 
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        documentName={movingDocument?.name || ''}
        folders={availableFolders} 
        onConfirmMove={handleMoveConfirm} 
        isLoadingFolders={isLoadingFolders}
      />
    </div>
  );
}

export default DashboardPage;
