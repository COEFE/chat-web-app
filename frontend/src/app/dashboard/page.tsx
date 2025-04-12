'use client';

import { Loader2, Trash2, FileText, MoreHorizontal, RefreshCw, Maximize2, Minimize2, Eye, EyeOff, Folder, FolderPlus, Move, Pencil } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Skeleton from 'react-loading-skeleton'; 
import 'react-loading-skeleton/dist/skeleton.css'; 
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
import Breadcrumbs, { BreadcrumbItem } from '@/components/dashboard/Breadcrumbs'; // Import Breadcrumbs
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
import { cn } from "@/lib/utils"; 

interface DocumentTableProps {
  items: FilesystemItem[];
  isLoading: boolean;
  error: string | null;
  onSelectItem: (item: FilesystemItem | null) => void;
  onDeleteDocument: (docId: string) => Promise<void>;
  onFolderClick: (folderId: string, folderName: string) => void;
  onMoveClick: (docId: string, docName: string) => void;
  onRenameFolder: (folderId: string, currentName: string) => void;
  onDeleteFolder: (folderId: string, folderName: string) => void;
}

function DocumentTable({ 
  items, 
  isLoading, 
  error, 
  onSelectItem, 
  onDeleteDocument, 
  onFolderClick, 
  onMoveClick, 
  onRenameFolder, 
  onDeleteFolder 
}: DocumentTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [docToDelete, setDocToDelete] = useState<FilesystemItem | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<FilesystemItem | null>(null); // State for confirmation dialog
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
          {isLoading ? (
            // Render Skeleton loaders when loading
            Array.from({ length: 5 }).map((_, index) => (
              <TableRow key={`skeleton-${index}`}>
                <TableCell className="w-8"><Skeleton circle width={16} height={16} /></TableCell>
                <TableCell className="w-[200px]"><Skeleton height={20} /></TableCell>
                <TableCell><Skeleton height={20} width={80} /></TableCell>
                <TableCell><Skeleton height={20} width={60} /></TableCell>
                <TableCell className="text-right"><Skeleton height={32} width={32} /></TableCell>
              </TableRow>
            ))
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
                      <DropdownMenu 
                        open={openDropdown === item.id} 
                        onOpenChange={(open) => setOpenDropdown(open ? item.id : null)}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open folder menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onRenameFolder(item.id, item.name)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 hover:text-red-700 focus:bg-red-50 focus:text-red-700"
                            onSelect={(e) => {
                              e.preventDefault();
                              setOpenDropdown(null);
                              setItemToDelete(item); // Set item for confirmation
                              // Dialog trigger will be handled outside or wrapped
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                      <DropdownMenu 
                        open={openDropdown === doc.id} 
                        onOpenChange={(open) => setOpenDropdown(open ? doc.id : null)}
                      >
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
                          <DropdownMenuItem 
                            onSelect={(event) => {
                              event.preventDefault(); // Prevent default selection behavior if any
                              setOpenDropdown(null); // Close dropdown first
                              
                              // Delay opening the modal to ensure dropdown is fully closed
                              setTimeout(() => {
                                onMoveClick(doc.id, doc.name);
                              }, 50);
                            }}
                          >
                            <Move className="mr-2 h-4 w-4" />
                            Move
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 hover:text-red-700 focus:bg-red-50 focus:text-red-700"
                            onSelect={(e) => {
                              e.preventDefault();
                              setOpenDropdown(null); // Close dropdown first
                              
                              // Delay setting state to ensure dropdown is fully closed
                              setTimeout(() => {
                                setDocToDelete(doc); // Set the doc to be deleted
                              }, 50);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Delete</span>
                          </DropdownMenuItem>
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

      {/* Decoupled Delete Confirmation Dialog */}
      <AlertDialog open={itemToDelete !== null} onOpenChange={(isOpen) => !isOpen && setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the {itemToDelete?.type === 'folder' ? 'folder' : 'document'}
              {' '}
              <span className="font-medium">'{itemToDelete?.name}'</span>.
              {itemToDelete?.type === 'folder' && ' All contents within this folder will also be deleted.'} {/* Add warning for folder deletion */}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)} disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!itemToDelete) return;

              setDeletingId(itemToDelete.id);
              setIsDeleting(true);

              if (itemToDelete.type === 'document') {
                // Simply call the onDeleteDocument function and let it handle the UI updates
                onDeleteDocument(itemToDelete.id)
                  .catch((error: unknown) => {
                    console.error(`Error deleting document ${itemToDelete.id}:`, error);
                    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
                    toast({ variant: "destructive", title: "Error", description: `Failed to delete document '${itemToDelete.name}'. ${message}` });
                  })
                  .finally(() => {
                    setIsDeleting(false);
                    setItemToDelete(null); // This closes the dialog
                  });
              } else if (itemToDelete.type === 'folder') {
                const deleteFolderFunction = httpsCallable(functionsInstance, 'deleteFolder');
                deleteFolderFunction({ folderId: itemToDelete.id })
                  .then((result) => {
                    const responseData = result.data as { success: boolean; message?: string };

                    if (responseData.success) {
                      toast({ title: "Success", description: `Folder '${itemToDelete.name}' and its contents deleted successfully.` });
                      // We don't need to manually update state or navigate here
                      // The page will refresh when the dialog is closed
                    } else {
                      throw new Error(responseData.message || 'Unknown error from function.');
                    }
                  })
                  .catch((error: unknown) => {
                    console.error(`Error calling deleteFolder function for ${itemToDelete.id}:`, error);
                    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
                    toast({ variant: "destructive", title: "Error", description: `Failed to delete folder '${itemToDelete.name}'. ${message}` });
                  })
                  .finally(() => {
                    setIsDeleting(false);
                    setItemToDelete(null); // This closes the dialog since it's controlled by itemToDelete !== null
                  });
              }
            }} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const [folderPath, setFolderPath] = useState<BreadcrumbItem[]>([]); // State for breadcrumbs
  const [selectedDocument, setSelectedDocument] = useState<MyDocumentData | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isViewerVisible, setIsViewerVisible] = useState(true);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  // State for folder renaming
  const [folderToRename, setFolderToRename] = useState<{id: string; currentName: string} | null>(null);
  const [newRenameFolderName, setNewRenameFolderName] = useState("");
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
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

      // Fetch folders
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

      // Fetch documents with improved logging
      console.log(`[Dashboard] Fetching documents for user ${userId} in folder ${currentFolderId}`);
      
      // Try to fetch documents with newest first (requires composite index)
      let documentSnapshot;
      try {
        const documentsQueryByCreatedAt = query(
          collection(db, 'users', userId, 'documents'),
          where('folderId', '==', currentFolderId),
          orderBy('createdAt', 'desc') // Sort by creation time descending to show newest first
        );
        
        console.log('[Dashboard] Executing Firestore query for documents (sorted by createdAt)...');
        documentSnapshot = await getDocs(documentsQueryByCreatedAt);
        console.log('[Dashboard] Successfully retrieved documents sorted by creation date');
      } catch (indexError) {
        // If the index doesn't exist, fall back to the original query
        console.warn('[Dashboard] Index error, falling back to name sorting:', indexError);
        
        // Display a toast with the index creation link
        toast({
          title: "Missing Firestore Index",
          description: "Documents are being sorted by name instead of creation date. An administrator should create the required index in Firebase Console.",
          variant: "destructive"
        });
        
        // Fall back to the original query (sorted by name)
        const documentsQueryByName = query(
          collection(db, 'users', userId, 'documents'),
          where('folderId', '==', currentFolderId),
          orderBy('name', 'asc')
        );
        
        console.log('[Dashboard] Falling back to name-based sorting query...');
        documentSnapshot = await getDocs(documentsQueryByName);
      }
      console.log(`[Dashboard] Query returned ${documentSnapshot.docs.length} documents`);
      
      // Log each document ID for debugging
      documentSnapshot.docs.forEach((doc, index) => {
        console.log(`[Dashboard] Document ${index+1}: ID=${doc.id}, Name=${doc.data().name}`);
      });
      
      const fetchedDocs: MyDocumentData[] = documentSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        uploadedAt: doc.data().uploadedAt as Timestamp,
        createdAt: doc.data().createdAt as Timestamp,
        updatedAt: doc.data().updatedAt as Timestamp,
      } as MyDocumentData));
      const documentItems: FilesystemItem[] = fetchedDocs.map(d => ({ ...d, type: 'document' }));
      console.log(`[Dashboard] Processed ${fetchedDocs.length} documents into UI items`);

      setFilesystemItems([...folderItems, ...documentItems]);
      console.log(`[Dashboard] Updated UI with ${folderItems.length} folders and ${documentItems.length} documents`);

    } catch (error) {
      console.error('[Dashboard] Error fetching documents or folders:', error);
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
    setFolderPath(prev => [...prev, { id: folderId, name: folderName }]);
    setSelectedDocument(null);
  }, [setCurrentFolderId, setFolderPath]);

  const handleBreadcrumbNavigate = (folderId: string) => {
    console.log(`Navigating via breadcrumb to: ${folderId}`);
    if (folderId === 'root') {
      setFolderPath([]);
      setCurrentFolderId(null);
      setSelectedDocument(null);
    } else {
      const itemIndex = folderPath.findIndex(item => item.id === folderId);
      if (itemIndex !== -1) {
        setFolderPath(prevPath => prevPath.slice(0, itemIndex + 1));
        setCurrentFolderId(folderId);
        setSelectedDocument(null);
      }
    }
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
    
    console.log(`Attempting to delete document with ID: ${docId}`); // Add logging

    const response = await fetch(`/api/documents?id=${docId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log('Delete API Response Status:', response.status); // Log status

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' })); // Try to parse error
      console.error('Delete API Error Response:', errorData); // Log error response body
      throw new Error(errorData.message || `Failed to delete document. Status: ${response.status}`);
    }

    // Document deleted successfully
    console.log('Document deleted successfully via API.'); // Log success
    toast({ title: "Success", description: "Document deleted successfully." });

    // Refresh the document list
    console.log('Triggering document list refresh...'); // Log refresh trigger
    await triggerRefresh(); // Ensure this is called

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

  const handleRenameFolder = (folderId: string, currentName: string) => {
    // Open the rename folder dialog
    console.log(`Initiating rename for folder: ${currentName} (${folderId})`);
    setFolderToRename({ id: folderId, currentName });
    setNewRenameFolderName(currentName); // Pre-fill with current name
  };
  
  const confirmRenameFolder = async () => {
    if (!folderToRename || !newRenameFolderName.trim() || !user) return;
    
    setIsRenamingFolder(true);
    const { id, currentName } = folderToRename;
    const trimmedNewName = newRenameFolderName.trim();
    
    // Don't do anything if the name hasn't changed
    if (trimmedNewName === currentName) {
      setIsRenamingFolder(false);
      setFolderToRename(null);
      return;
    }
    
    try {
      // Call the renameFolder Firebase Function
      const renameFolderFunction = httpsCallable<
        { folderId: string; newName: string },
        { success: boolean; message?: string }
      >(functionsInstance, 'renameFolder');
      
      const result = await renameFolderFunction({ 
        folderId: id, 
        newName: trimmedNewName 
      });
      
      const responseData = result.data as { success: boolean; message?: string };
      
      if (responseData.success) {
        toast({ 
          title: "Success", 
          description: `Folder renamed to '${trimmedNewName}' successfully.` 
        });
        
        // Update the local state to reflect the change
        setFolders(prev => prev.map(folder => 
          folder.id === id ? { ...folder, name: trimmedNewName } : folder
        ));
        
        // If this is the current folder, update the breadcrumbs
        if (currentFolderId === id) {
          setFolderPath(prev => prev.map(item => 
            item.id === id ? { ...item, name: trimmedNewName } : item
          ));
        }

        // Trigger a refresh to update the UI
        triggerRefresh();
      } else {
        throw new Error(responseData.message || 'Unknown error occurred');
      }
    } catch (error) {
      console.error(`Error renaming folder ${id}:`, error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: `Failed to rename folder: ${message}` 
      });
    } finally {
      setIsRenamingFolder(false);
      setFolderToRename(null);
      setNewRenameFolderName("");
    }
  };

  // This function is passed to DocumentTable as onDeleteFolder
  // The DocumentTable component will handle opening the confirmation dialog
  const handleDeleteFolder = (folderId: string, folderName: string) => {
    console.log(`Delete folder requested: ${folderName} (${folderId})`);
    // The actual deletion happens in the DocumentTable component
    // We don't need to do anything here as the DocumentTable will handle the confirmation and deletion
  };

  // Effect to listen for document-list-refresh events
  useEffect(() => {
    const handleDocumentListRefresh = (event: CustomEvent) => {
      console.log('[Dashboard] Received document-list-refresh event:', event.detail);
      
      // Add a small delay before refreshing to allow Firestore to complete indexing
      console.log('[Dashboard] Waiting 1.5 seconds before refreshing document list...');
      setTimeout(() => {
        console.log('[Dashboard] Triggering document list refresh after delay');
        triggerRefresh();
      }, 1500);
    };

    window.addEventListener('document-list-refresh', handleDocumentListRefresh as EventListener);
    
    return () => {
      window.removeEventListener('document-list-refresh', handleDocumentListRefresh as EventListener);
    };
  }, []);

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
          <Breadcrumbs path={folderPath} onNavigate={handleBreadcrumbNavigate} />
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
                <div className={cn(
                  "border-r", 
                  selectedDocument ? "w-[70%]" : "w-full"
                )}>
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
                            <CardDescription>Drag & drop files here or click to select files. Files will be added to the current folder: <span className='font-medium'>{folderPath[folderPath.length - 1]?.name ?? 'Home'}</span></CardDescription>
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
                              onRenameFolder={handleRenameFolder}
                              onDeleteFolder={handleDeleteFolder}
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
                
                {selectedDocument && (
                  <div className="w-[30%]">
                    <div className="flex h-full flex-col p-6">
                      <ChatInterface documentId={selectedDocument.id} document={selectedDocument} />
                    </div>
                  </div>
                )}
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

      {/* Rename Folder Dialog */}
      <Dialog open={folderToRename !== null} onOpenChange={(open) => !open && setFolderToRename(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>
              Enter a new name for the folder "{folderToRename?.currentName}".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="rename-folder-name" className="text-right">
                Name
              </Label>
              <Input
                id="rename-folder-name"
                value={newRenameFolderName}
                onChange={(e) => setNewRenameFolderName(e.target.value)}
                className="col-span-3"
                placeholder="Enter new folder name"
                autoFocus
                disabled={isRenamingFolder}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setFolderToRename(null)} 
              disabled={isRenamingFolder}
            >
              Cancel
            </Button>
            <Button 
              type="button"
              onClick={confirmRenameFolder} 
              disabled={!newRenameFolderName.trim() || isRenamingFolder}
            >
              {isRenamingFolder ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Renaming...
                </>
              ) : (
                'Rename'
              )}
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
