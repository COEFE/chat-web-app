'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FilesystemItem, MyDocumentData } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { FileText, Folder, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AddDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentSelect: (documentId: string) => void;
  excludedDocumentIds: string[];
}

export function AddDocumentModal({
  isOpen,
  onClose,
  onDocumentSelect,
  excludedDocumentIds
}: AddDocumentModalProps) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<MyDocumentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch documents when the modal opens
  useEffect(() => {
    if (isOpen && user) {
      console.log('Modal opened, fetching documents...');
      fetchDocuments();
    }
  }, [isOpen, user]);
  
  // Debug: Log documents when they change
  useEffect(() => {
    console.log('Documents state updated:', documents.length, 'documents');
  }, [documents]);

  const fetchDocuments = async () => {
    if (!user) {
      console.error('No user found when trying to fetch documents');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setDocuments([]); // Clear documents while loading
      
      const db = getFirestore();
      const docsRef = collection(db, `users/${user.uid}/documents`);
      
      // Temporarily remove ordering to test fetching
      // const q = query(docsRef, orderBy('updatedAt', 'desc'));
      const q = query(docsRef); // Fetch without ordering
      
      console.log('Fetching documents for user:', user.uid);
      const querySnapshot = await getDocs(q);
      
      console.log('Firestore query executed. Snapshot size:', querySnapshot.size);
      
      if (querySnapshot.empty) {
        console.log('No documents found for user');
        setDocuments([]);
        return;
      }
      
      const fetchedDocs: MyDocumentData[] = [];
      querySnapshot.forEach((doc) => {
        // Extract document data and add to our array
        const docData = doc.data();
        try {
          // Log the raw updatedAt field before processing
          console.log(`Document ${doc.id} raw updatedAt:`, docData.updatedAt, typeof docData.updatedAt);
          
          // Log the document data to help diagnose issues
          // console.log('Document data:', doc.id, docData);
          
          // Determine display name, prioritizing fileName
          const displayName = docData.name || docData.fileName || 'Unnamed document';
          fetchedDocs.push({
            id: doc.id,
            ...docData,
            name: displayName
          } as MyDocumentData);
        } catch (e) {
          console.error('Error processing document:', doc.id, e);
        }
      });
      
      console.log(`Fetched ${fetchedDocs.length} documents`);
      setDocuments(fetchedDocs);
    } catch (err) {
      console.error('Error fetching documents:', err);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  // Filter documents based on search query and excluded IDs
  console.log('Documents available for filtering:', documents.length);
  console.log('IDs to exclude:', excludedDocumentIds);
  const filteredDocuments = documents.filter(doc => {
    console.log('Filtering document:', doc.id, doc.name, 'excluded:', excludedDocumentIds.includes(doc.id));
    return doc.name && // Ensure document has a name property
      !excludedDocumentIds.includes(doc.id) && 
      doc.name.toLowerCase().includes(searchQuery.toLowerCase());
  });
  
  // Debug: Log filtered documents
  console.log('Filtered documents:', filteredDocuments.length, 'out of', documents.length);

  const handleDocumentSelect = (documentId: string) => {
    onDocumentSelect(documentId);
    onClose();
  };

  console.log('AddDocumentModal rendering with isOpen:', isOpen);
  
  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => {
        console.log('Dialog onOpenChange triggered with open:', open);
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden">

        <DialogHeader>
          <DialogTitle>Add Document to Chat</DialogTitle>
          <DialogDescription>
            Select a document to add to your current chat session.
          </DialogDescription>
        </DialogHeader>
        
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        {/* Content area - Ensure it takes remaining space and scrolls */}
        <div className="flex-1 border-t overflow-hidden">
          <ScrollArea className="h-[60vh] md:h-[50vh]">
            <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full"> {/* Center loading in scroll area */}
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="ml-2">Loading documents...</span>
            </div>
          ) : error ? (
            <div className="text-center text-red-500 p-4">
              <p>{error}</p>
              <Button onClick={fetchDocuments} className="mt-2">Try Again</Button>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center text-muted-foreground p-4">
              {searchQuery ? 'No matching documents found.' : documents.length === 0 ? 'No documents available. Upload documents from the dashboard first.' : 'No documents available.'}
              {searchQuery && <Button onClick={() => setSearchQuery('')} className="mt-2">Clear Search</Button>}
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">Debug info:</p>
                <p className="text-xs text-muted-foreground">Total documents: {documents.length}</p>
                <p className="text-xs text-muted-foreground">Filtered documents: {filteredDocuments.length}</p>
                <p className="text-xs text-muted-foreground">Excluded IDs: {excludedDocumentIds.join(', ')}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredDocuments.map((doc) => {
                
                // Safely handle date display
                let dateDisplay = 'Unknown date';
                try {
                  if (doc.updatedAt) {
                    if (typeof doc.updatedAt.toDate === 'function') {
                      // Handle Firestore Timestamp
                      dateDisplay = doc.updatedAt.toDate().toLocaleDateString();
                    } else if (doc.updatedAt instanceof Date) {
                      // Handle JavaScript Date
                      dateDisplay = doc.updatedAt.toLocaleDateString();
                    } else if (typeof doc.updatedAt === 'string' || typeof doc.updatedAt === 'number') {
                      // Handle string or number timestamp
                      dateDisplay = new Date(doc.updatedAt).toLocaleDateString();
                    }
                  }
                } catch (e) {
                  console.error('Error formatting date for document:', doc.id, e);
                }
                
                return (
                  <Card 
                    key={doc.id}
                    className={`hover:shadow-md transition-shadow cursor-pointer ${excludedDocumentIds.includes(doc.id) ? 'opacity-50 pointer-events-none' : ''}`}
                    onClick={() => handleDocumentSelect(doc.id)}
                  >
                    <CardHeader className="flex flex-row items-start space-y-0 pb-2 pt-4 px-4">
                      <FileText className="h-5 w-5 text-gray-500 mr-2" />
                      <div className="truncate flex-1">
                        <p className="text-sm font-medium leading-none truncate" title={doc.name}>
                          {doc.name || 'Unnamed document'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {dateDisplay}
                        </p>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}
            </div>
          </ScrollArea>
        </div>
        
        {/* Footer removed to maximize space for document scrolling */}
      </DialogContent>
    </Dialog>
  );
}

export default AddDocumentModal;
