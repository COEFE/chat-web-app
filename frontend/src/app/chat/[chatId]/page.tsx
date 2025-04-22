// frontend/src/app/chat/[chatId]/page.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ChatInterface from "@/components/dashboard/ChatInterface"; 
import DocumentViewer from "@/components/dashboard/DocumentViewer"; 
import { doc, getDoc, updateDoc, arrayUnion, DocumentData } from "firebase/firestore"; 
import { db } from "@/lib/firebaseConfig"; 
import { Loader2, ArrowLeft, FilePlus } from "lucide-react"; 
import { Button } from '@/components/ui/button';
import AddDocumentModal from "@/components/dashboard/AddDocumentModal"; 
import { MyDocumentData } from "@/types"; 
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Added Select imports
 
// Interface for basic Chat Info from Firestore
interface ChatMetadata {
  id: string;
  title: string;
  createdAt: any; 
  userId: string;
  linkedDocumentIds?: string[]; // Array of linked document IDs
} 
 
const ChatPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const chatId = params.chatId as string; 
 
  const [chatMetadata, setChatMetadata] = useState<ChatMetadata | null>(null); // State for chat metadata
  const [linkedDocuments, setLinkedDocuments] = useState<MyDocumentData[]>([]); // State for full document data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddDocumentModalOpen, setIsAddDocumentModalOpen] = useState(false); 
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null); // State for active document
 
  // Fetch Chat Metadata and then Linked Documents
  const fetchChatAndDocuments = useCallback(async () => {
    if (!user?.uid || !chatId) {
      setError("User or Chat ID missing.");
      setLoading(false);
      setChatMetadata(null);
      setLinkedDocuments([]);
      setActiveDocumentId(null); // Clear active doc if user or chat ID missing
      return;
    }

    setLoading(true);
    setError(null);
    setChatMetadata(null); // Clear previous data
    setLinkedDocuments([]); // Clear previous docs
    setActiveDocumentId(null); // Clear active doc
    console.log(`Fetching chat metadata for chat: ${chatId}`);

    try {
      // 1. Fetch Chat Metadata
      const chatDocRef = doc(db, `users/${user.uid}/chats/${chatId}`);
      const chatDocSnap = await getDoc(chatDocRef);

      if (chatDocSnap.exists()) {
        const fetchedChatMeta = {
          id: chatDocSnap.id,
          ...chatDocSnap.data(),
        } as ChatMetadata;
        setChatMetadata(fetchedChatMeta);
        console.log("Chat metadata fetched:", fetchedChatMeta);

        // 2. Fetch Linked Documents if IDs exist
        const docIds = fetchedChatMeta.linkedDocumentIds || [];
        if (docIds.length > 0) {
          console.log(`Fetching ${docIds.length} linked documents:`, docIds);
          const docPromises = docIds.map(async (id) => {
            const docRef = doc(db, `users/${user.uid}/documents/${id}`);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              return { id: docSnap.id, ...docSnap.data() } as MyDocumentData;
            } else {
              console.warn(`Document with ID ${id} not found.`);
              return null; // Handle case where a linked doc might be deleted
            }
          });
          const fetchedDocs = (await Promise.all(docPromises)).filter(Boolean) as MyDocumentData[];
          setLinkedDocuments(fetchedDocs);
          // Set the first document as active initially
          if (fetchedDocs.length > 0 && !activeDocumentId) { // Only set if not already set
            setActiveDocumentId(fetchedDocs[0].id);
            console.log(`Initial active document set to: ${fetchedDocs[0].id}`);
          }
          console.log("Linked documents fetched:", fetchedDocs);
        } else {
          console.log("No linked documents found for this chat.");
          setLinkedDocuments([]);
          setActiveDocumentId(null); // Clear active doc if no docs
        }
      } else {
        setError("Chat not found.");
        setChatMetadata(null);
        setLinkedDocuments([]);
        setActiveDocumentId(null); // Clear active doc if chat not found
      }
    } catch (err) {
      console.error("Error fetching chat/document data:", err);
      setError("Failed to load chat data.");
      setChatMetadata(null);
      setLinkedDocuments([]);
      setActiveDocumentId(null);
    } finally {
      setLoading(false);
    }
  }, [user, chatId]); // Remove activeDocumentId dependency
 
  // Function to handle document selection from the modal
  const handleDocumentSelected = async (selectedDocId: string) => { // Updated logic
    if (!user || !chatId) return;

    console.log(`Adding document ${selectedDocId} to chat ${chatId}`);
    // Consider adding a specific 'isAdding' state for finer-grained loading feedback
    try {
      const chatDocRef = doc(db, `users/${user.uid}/chats/${chatId}`);
      // Update the chat document in Firestore using arrayUnion
      await updateDoc(chatDocRef, {
        linkedDocumentIds: arrayUnion(selectedDocId)
      });
      console.log("Chat document updated with new linkedDocumentId.");

      // Refetch all data to ensure consistency and update loading state
      await fetchChatAndDocuments();

      setIsAddDocumentModalOpen(false);
    } catch (err) {
      console.error("Error updating chat document:", err);
      setError("Failed to link document to chat.");
      // Potentially reset 'isAdding' state here if used
    }
  };

  // Initial fetch
  useEffect(() => {
    if (authLoading) return; 
    if (!user) {
      router.push('/login'); // Ensure this matches your login route
      return;
    }
    fetchChatAndDocuments();
  }, [authLoading, user, chatId, router, fetchChatAndDocuments]); // Keep deps, fetchChatAndDocuments is stable now
 
  // Effect to manage the active document based on the fetched list
  useEffect(() => {
    if (!activeDocumentId && linkedDocuments.length > 0) {
      setActiveDocumentId(linkedDocuments[0].id);
      console.log(`Effect: Setting initial active document to: ${linkedDocuments[0].id}`);
    } else if (activeDocumentId && linkedDocuments.length > 0 && !linkedDocuments.some(doc => doc.id === activeDocumentId)) {
       setActiveDocumentId(linkedDocuments[0].id);
       console.log(`Effect: Active document ${activeDocumentId} not found, resetting to: ${linkedDocuments[0].id}`);
    } else if (linkedDocuments.length === 0) {
       setActiveDocumentId(null);
       console.log('Effect: No linked documents, clearing active document.');
    }
  }, [linkedDocuments, activeDocumentId]);
 
  const handleBack = () => {
    router.back();
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading Chat...</span>
      </div>
    );
  }

  // Add explicit check for user after loading is complete
  if (!user) {
    // This should ideally not be reached due to the redirect logic in useEffect,
    // but it acts as a safeguard and satisfies the type checker.
    console.error("ChatPage rendered without authenticated user after loading.");
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">Authentication error. Please try logging in again.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600">
        Error: {error}
      </div>
    );
  }

  // Check if chat metadata exists (chat itself was found)
  if (!chatMetadata) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        Chat not found or you do not have permission to view it.
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBack}
        className="absolute top-4 left-4 z-10"
        aria-label="Go back"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      {/* Add Document Button - Always available if chat exists */} 
      {chatMetadata && (
        <Button 
          variant="outline"
          size="sm"
          onClick={() => setIsAddDocumentModalOpen(true)}
          className="absolute top-3 right-4 z-10"
          aria-label="Add Document"
        >
          <FilePlus className="h-4 w-4 mr-2" />
          Add Document
        </Button>
      )}

      <header className="p-4 pt-4 pl-16 border-b dark:border-gray-700 text-center">
        <h1 className="text-xl font-semibold truncate">
          {/* Title: Use first doc name if available, else chat title */} 
          {linkedDocuments.length > 0 && linkedDocuments[0]?.name ? 
            `Chat: ${linkedDocuments[0].name}${linkedDocuments.length > 1 ? ` (+${linkedDocuments.length - 1})` : ''}` : 
            chatMetadata?.title || `Chat (${chatId!.substring(0, 6)}...)`
          }
        </h1>
      </header>

      {/* --- Conditional Layout based on document presence --- */} 
      <div className="flex-1 flex overflow-hidden"> 
        {linkedDocuments.length > 0 ? (
          // ** Split View: Document + Chat **
          <>
            {/* Find the active document object */}
            {(() => { // IIFE to find active doc cleanly
              const activeDoc = linkedDocuments.find(doc => doc.id === activeDocumentId);
              // Render the viewer only if an active doc is found
              if (!activeDoc) {
                // Handle case where activeDocumentId is set but doc not found (shouldn't happen ideally)
                // Could default to first doc or show an error/placeholder
                if (linkedDocuments.length > 0) {
                  console.warn(`Active document ${activeDocumentId} not found in linked list, defaulting to first.`);
                  setActiveDocumentId(linkedDocuments[0].id); // Attempt recovery
                  return null; // Prevent rendering viewer this cycle
                } 
                return (
                  <div className="w-1/2 flex items-center justify-center text-muted-foreground">
                    Select a document to view.
                  </div>
                );
              }
              
              return (
                <div className="w-[70%] flex-shrink-0 border-r dark:border-gray-700 overflow-auto flex flex-col"> {/* Left Pane: Document (70%) */} 
                  {/* Document Selector Dropdown */} 
                  {linkedDocuments.length > 1 && activeDoc && ( // Only show selector if more than one doc & active one exists
                    <div className="p-2 border-b dark:border-gray-700 flex-shrink-0"> {/* Ensure this doesn't shrink */} 
                      <Select
                        value={activeDocumentId || ''} // Ensure value is controlled and defined
                        onValueChange={(value) => {
                          if (value) { // Ensure a value was selected
                            console.log(`Document selected via dropdown: ${value}`);
                            setActiveDocumentId(value);
                          } 
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select document to view" />
                        </SelectTrigger>
                        <SelectContent>
                          {linkedDocuments.map((doc) => (
                            <SelectItem key={doc.id} value={doc.id}>
                              {doc.name || `Document ${doc.id.substring(0, 6)}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* Document Viewer */} 
                  <DocumentViewer 
                    document={activeDoc} // Pass the found active document
                    className="flex-1" 
                  />
                </div>
              );
            })()}
 
            {/* Right Panel: Chat Interface */} 
            <div className="w-[30%] flex-shrink-0 flex flex-col overflow-auto"> {/* Right Pane: Chat (30%) */}
              <ChatInterface 
                chatId={chatId} 
                userId={user.uid} 
                linkedDocuments={linkedDocuments} // Pass *all* linked documents
              />
            </div>
          </>
        ) : (
          // ** Full Width Chat View **
          <div className="w-full flex flex-col">
            {chatId ? (
              <ChatInterface 
                chatId={chatId} 
                userId={user.uid} 
                linkedDocuments={[]} // Pass empty array if no documents
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select or start a new chat.
              </div>
            )}
          </div>
        )}
      </div>
      <AddDocumentModal
        isOpen={isAddDocumentModalOpen}
        onClose={() => setIsAddDocumentModalOpen(false)}
        onDocumentSelect={handleDocumentSelected}
        excludedDocumentIds={linkedDocuments.map(doc => doc.id)} // Exclude all linked docs
      />
    </div>
  );
}

export default ChatPage;
