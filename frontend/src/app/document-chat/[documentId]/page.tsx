'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Maximize2, Minimize2, Plus, MessageSquare, X } from 'lucide-react';
import DocumentViewer from '@/components/dashboard/DocumentViewer';
import ChatInterface from '@/components/dashboard/ChatInterface';
import { useAuth } from '@/context/AuthContext';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import AddDocumentModal from '@/components/dashboard/AddDocumentModal';
import { MyDocumentData } from '@/types';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

export default function DocumentChatPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [documents, setDocuments] = useState<MyDocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isAddDocumentModalOpen, setIsAddDocumentModalOpen] = useState(false);
  const [isChatVisibleMobile, setIsChatVisibleMobile] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState<string>('');
  const documentId = params?.documentId as string || '';
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  // Define document title state that will be updated when documents/activeDocumentId change
  const [documentTitle, setDocumentTitle] = useState<string>('Document Viewer');

  // Set the active document ID when documents change
  useEffect(() => {
    if (documents.length > 0 && (!activeDocumentId || !documents.some(doc => doc.id === activeDocumentId))) {
      setActiveDocumentId(documents[0].id);
    }
  }, [documents, activeDocumentId]);

  // Update document title when active document changes
  useEffect(() => {
    const activeDoc = documents.find(doc => doc.id === activeDocumentId);
    const title = activeDoc?.name || 'Document Viewer';
    setDocumentTitle(title);
  }, [documents, activeDocumentId]);
  
  // Update browser title when documentTitle changes
  useEffect(() => {
    document.title = `${documentTitle} | Chat Web App`;
  }, [documentTitle]);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/login');
      return;
    }

    const fetchInitialDocument = async () => {
      try {
        setLoading(true);
        const db = getFirestore();
        const docRef = doc(db, `users/${user.uid}/documents/${documentId}`);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          // Add the document to the documents array
          setDocuments([{
            id: docSnap.id,
            ...docSnap.data(),
          } as MyDocumentData]);
          
          // Set this document as active
          setActiveDocumentId(docSnap.id);
        } else {
          setError('Document not found');
          setDocuments([]); // Ensure documents array is empty on error
        }
      } catch (err) {
        console.error('Error fetching initial document:', err);
        setError('Failed to load document');
        setDocuments([]); // Ensure documents array is empty on error
      } finally {
        setLoading(false);
      }
    };

    // Only fetch if we have a valid documentId and user
    if (documentId && user) {
      fetchInitialDocument();
    }
  }, [documentId, user, authLoading, router]);

  const handleBack = () => {
    // Use push to dashboard instead of back() to ensure consistent navigation
    router.push('/dashboard');
  };

  // Open the document selection modal
  const handleAddDocument = () => {
    console.log('Opening document selection modal');
    setIsAddDocumentModalOpen(true);
  };

  // Handle document selection from the modal
  const handleDocumentSelected = async (selectedDocId: string) => {
    if (!user) return;
    
    try {
      // Check if document is already in the array
      if (documents.some(doc => doc.id === selectedDocId)) {
        console.log('Document already added to chat');
        // Just switch to this document if it's already in the array
        setActiveDocumentId(selectedDocId);
        setIsAddDocumentModalOpen(false);
        return;
      }

      // Show loading state
      setLoading(true);
      
      // Fetch the selected document
      const db = getFirestore();
      const docRef = doc(db, `users/${user.uid}/documents/${selectedDocId}`);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const newDoc = {
          id: docSnap.id,
          ...docSnap.data(),
        } as MyDocumentData;
        
        // Add the new document to the documents array
        setDocuments(prevDocs => [...prevDocs, newDoc]);
        
        // Set the new document as active
        setActiveDocumentId(newDoc.id);
        
        // Close the modal
        setIsAddDocumentModalOpen(false);
      } else {
        console.error('Selected document not found');
        // Show error message
        setError('Selected document not found');
      }
    } catch (err) {
      console.error('Error fetching selected document:', err);
      setError('Failed to load selected document');
    } finally {
      setLoading(false);
    }
  };
  
  // Remove a document from the chat
  const handleRemoveDocument = (documentIdToRemove: string) => {
    // Don't remove if it's the only document
    if (documents.length <= 1) {
      return;
    }
    
    // Remove the document from the array
    setDocuments(prevDocs => prevDocs.filter(doc => doc.id !== documentIdToRemove));
    
    // If we're removing the active document, switch to another one
    if (activeDocumentId === documentIdToRemove) {
      // Find the first document that's not the one we're removing
      const newActiveDoc = documents.find(doc => doc.id !== documentIdToRemove);
      if (newActiveDoc) {
        setActiveDocumentId(newActiveDoc.id);
      }
    }
  };

  // Toggle mobile chat visibility
  const toggleChatVisibility = () => {
    setIsChatVisibleMobile(prev => !prev);
  };

  // Show a more detailed loading state during authentication
  if (authLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <div className="mb-4 text-xl font-semibold">Loading document viewer...</div>
        <div className="text-sm text-muted-foreground">Please wait while we authenticate your session</div>
      </div>
    );
  }

  // Only return null if we're sure the user isn't authenticated
  if (!user && !authLoading) {
    return null; // Router will redirect to login
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading document...</div>;
  }

  if (error || documents.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <p className="text-red-500 mb-4">{error || 'Document not found'}</p>
        <Button onClick={handleBack}>Back to Dashboard</Button>
      </div>
    );
  }

  // Get the active document for rendering
  const activeDocument = documents.find(doc => doc.id === activeDocumentId);
  
  return (
    <div className="flex h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:px-6">
        <Button variant="ghost" size="sm" onClick={handleBack} className="mr-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-base font-semibold truncate flex-1 md:ml-auto">
          {documentTitle} 
        </h1>
        
        {/* Button Group (Aligned Right) */}
        <div className="ml-auto flex items-center gap-2">
          {/* Add Document Button - Icon only on mobile */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddDocument}
            title="Add another document to chat"
            // Removed ml-auto, handled by parent div
          >
            <Plus className="h-4 w-4 md:mr-1" /> {/* Keep icon, add margin only on desktop */} 
            <span className="hidden md:inline">Add Document</span> {/* Text only on desktop */} 
          </Button>

          {/* Chat Toggle Button (Mobile Only, inside group) */} 
          {isMobile && !isMaximized && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleChatVisibility}
              title={isChatVisibleMobile ? "Hide Chat" : "Show Chat"}
              className="md:hidden" // Removed ml-2, gap handled by parent div
            >
              {isChatVisibleMobile ? <X className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            </Button>
          )}
          {/* Maximize/Minimize Button - Render only if not mobile */}
          {!isMobile && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsMaximized(prev => !prev)}
              title={isMaximized ? "Exit full screen" : "Full screen"}
            >
              {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative"> {/* Add relative positioning for absolute chat panel */}
        <div className="flex h-full">
          {/* Document Viewer Container */}
          {/* Takes full width on mobile unless chat is open */}
          <div className={cn(
            "h-full flex flex-col transition-all duration-300 ease-in-out",
            isMaximized ? 'w-full' :
            isMobile ? 'w-full' : 'w-[70%] border-r' 
          )}>
            {/* Document Tabs */}
            <div className="flex border-b bg-muted/30 overflow-x-auto">
              {documents.map(doc => (
                <div 
                  key={doc.id}
                  className={`flex items-center px-4 py-2 text-sm font-medium border-r relative ${doc.id === activeDocumentId ? 'bg-background text-primary border-b-2 border-b-primary' : 'text-muted-foreground hover:bg-muted/50'}`}
                >
                  <button
                    className="truncate max-w-[150px]"
                    onClick={() => setActiveDocumentId(doc.id)}
                    title={doc.name}
                  >
                    {doc.name.length > 20 ? `${doc.name.substring(0, 20)}...` : doc.name}
                  </button>
                  
                  {/* Only show close button if we have more than one document */}
                  {documents.length > 1 && (
                    <button 
                      className="ml-2 text-muted-foreground hover:text-primary" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveDocument(doc.id);
                      }}
                      title="Remove from chat"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            
            {/* Document Viewer */}
            <div className="flex-1 overflow-auto">
              {activeDocumentId && documents.find(doc => doc.id === activeDocumentId) && (
                <DocumentViewer document={documents.find(doc => doc.id === activeDocumentId)!} />
              )}
            </div>
          </div>

          {/* Chat Interface Container */}
          {/* Desktop: Takes 30%, Mobile: Fixed overlay panel */}
          <div className={cn(
            "h-full flex flex-col transition-transform duration-300 ease-in-out",
            isMaximized ? 'hidden' :
            isMobile ? [
              'fixed top-14 right-0 bottom-0 z-40 w-full max-w-md bg-background border-l shadow-lg',
              isChatVisibleMobile ? 'translate-x-0' : 'translate-x-full'
            ] :
            'w-[30%]'
          )}>
            {/* Optional: Add a close button inside the chat panel for mobile */} 
            {isMobile && (
              <div className="flex justify-end p-2 border-b md:hidden">
                <Button variant="ghost" size="icon" onClick={toggleChatVisibility} title="Close Chat">
                  <X className="h-5 w-5" />
                </Button>
              </div>
            )}
            <ChatInterface 
              documentId={activeDocumentId} 
              document={documents.find(doc => doc.id === activeDocumentId)!} 
              additionalDocuments={documents.filter(doc => doc.id !== activeDocumentId)}
            />
          </div>
          
          {/* Mobile Chat Overlay (closes chat when clicking outside) */}
          {isMobile && isChatVisibleMobile && !isMaximized && (
            <div 
              className="fixed inset-0 z-30 bg-black/30 md:hidden"
              onClick={toggleChatVisibility}
            />
          )}
        </div>
      </main>
      
      {/* Add Document Modal */}
      {isAddDocumentModalOpen && (
        <AddDocumentModal
          isOpen={isAddDocumentModalOpen}
          onClose={() => {
            console.log('Closing document selection modal');
            setIsAddDocumentModalOpen(false);
          }}
          onDocumentSelect={handleDocumentSelected}
          excludedDocumentIds={documents.map(doc => doc.id)}
        />
      )}
    </div>
  );
}
