import React, { useState, useRef, useEffect } from 'react'; 
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area'; 
import { cn } from '@/lib/utils'; 
import { useAuth } from '@/context/AuthContext'; 
import { Timestamp } from 'firebase/firestore'; 
import { MyDocumentData } from '@/types'; 
import { useChat } from '@ai-sdk/react';
import { Message } from 'ai';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
} from 'firebase/firestore';

interface ChatInterfaceProps {
  documentId: string; // Primary/active document ID
  document?: MyDocumentData;
  // Optional additional properties for multi-document support
  additionalDocuments?: MyDocumentData[];
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ documentId, document, additionalDocuments = [] }) => {
  // Combine primary document with additional documents for context
  const allDocuments = document ? [document, ...additionalDocuments] : additionalDocuments;
  // Get all document IDs for the API call
  const allDocumentIds = allDocuments.map(doc => doc.id);
  const scrollAreaRef = useRef<HTMLDivElement>(null); 
  const { user } = useAuth(); 
  const [authToken, setAuthToken] = useState<string | null>(null); // State for auth token

  const [activeSheet, setActiveSheet] = useState<string | null>(null);

  // Effect to fetch the auth token when the user object changes
  useEffect(() => {
    if (user) {
      user.getIdToken()
        .then(token => {
          console.log("[ChatInterface] Auth token fetched successfully.");
          setAuthToken(token);
        })
        .catch(error => {
          console.error("[ChatInterface] Error fetching auth token:", error);
          setAuthToken(null); // Clear token on error
        });
    } else {
      console.log("[ChatInterface] No user, clearing auth token.");
      setAuthToken(null); // Clear token if user logs out
    }
  }, [user]); // Re-run when user changes

  // DEBUG: Log the auth token value before useChat is initialized
  console.log('[ChatInterface] Auth token before useChat:', authToken);

  // Prepare headers for useChat - ensure it's undefined if no token
  const chatHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
  // DEBUG: Log the headers being passed to useChat
  console.log('[ChatInterface] Headers for useChat:', chatHeaders);

  // Initialize useChat hook - provides messages, setMessages, etc.
  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } = useChat({
    api: '/api/chat',
    id: documentId, // Use primary document ID as the chat ID
    initialMessages: [], // Explicitly start with empty messages
    // Pass the prepared headers object (or undefined)
    headers: chatHeaders, 
    body: {
      documentId: documentId, // Primary document ID
      currentDocument: document, // Primary document data
      additionalDocumentIds: allDocumentIds.filter(id => id !== documentId), // Additional document IDs
      additionalDocuments: additionalDocuments, // Additional document data
      activeSheet: activeSheet,
    },
    onFinish: (message) => {
      console.log('Chat finished:', message);
      let refreshTriggered = false;
      if (message.role === 'assistant' /* && check for excel success marker/data */) {
          console.log('[ChatInterface] Possible Excel operation completed.');
          const excelSuccessMarker = '[EXCEL_DOCUMENT_UPDATED]';
          if (message.content.includes(excelSuccessMarker)) {
            console.log('[ChatInterface] Excel update marker detected, triggering refresh.');
            window.dispatchEvent(new Event('excel-document-updated'));
            window.dispatchEvent(new CustomEvent('document-list-refresh'));
            refreshTriggered = true;
            
            setMessages(prevMessages => prevMessages.map(msg => 
              msg.id === message.id 
                ? { ...msg, content: msg.content.replace(excelSuccessMarker, '').trim() } 
                : msg
            ));
          }
      }
    },
    onError: (err) => {
      console.error("Chat error:", err);
    }
  });

  // Effect to load chat history when documentId or user changes
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!documentId || !user?.uid) {
        console.log('[ChatInterface] No documentId or user, clearing messages.');
        setMessages([]); // Clear history if no document or user
        return;
      }

      console.log(`[ChatInterface] Attempting to load chat history for document: ${documentId}`);
      const db = getFirestore();
      // Assuming messages are stored directly under the document
      const messagesPath = `users/${user.uid}/documents/${documentId}/messages`;

      try {
        const messagesQuery = query(collection(db, messagesPath), orderBy('createdAt', 'asc'));
        const querySnapshot = await getDocs(messagesQuery);

        if (querySnapshot.empty) {
          console.log('[ChatInterface] No chat history found in Firestore.');
          setMessages([]); // Ensure messages are empty if none found
          return;
        }

        const fetchedMessages: Message[] = querySnapshot.docs.map(doc => {
          const data = doc.data();
          const createdAtTimestamp = data.createdAt as Timestamp;
          // Map Firestore data to the 'Message' type expected by useChat
          return {
            id: doc.id,
            role: data.role as Message['role'], // Cast role to expected type
            content: data.content as string,
            createdAt: createdAtTimestamp?.toDate() ?? new Date(), // Convert Timestamp to Date
          };
        });

        console.log(`[ChatInterface] Loaded ${fetchedMessages.length} messages from Firestore.`);
        setMessages(fetchedMessages); // Update the chat state

      } catch (err) {
        console.error('[ChatInterface] Error loading chat history:', err);
        setMessages([]); // Clear messages on error
        // Consider setting an error state to display to the user here
      }
    };

    loadChatHistory();
  }, [documentId, user, setMessages]); // Dependencies for the effect

  useEffect(() => {
    if (document?.id) {
      const savedSheet = localStorage.getItem(`activeSheet-${document.id}`);
      if (savedSheet) {
        console.log(`[ChatInterface] Found active sheet for document ${document.id}: ${savedSheet}`);
        setActiveSheet(savedSheet);
      } else {
        setActiveSheet(null);
      }

      const handleActiveSheetChange = (event: CustomEvent) => {
        const { documentId: eventDocId, sheetName } = event.detail;
        if (eventDocId === document.id) {
          console.log(`[ChatInterface] Received active sheet change event: ${sheetName}`);
          setActiveSheet(sheetName);
        }
      };
      window.addEventListener('activeSheetChanged', handleActiveSheetChange as EventListener);
      return () => {
        window.removeEventListener('activeSheetChanged', handleActiveSheetChange as EventListener);
      };
    }
  }, [document?.id]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]); // Scroll to bottom when messages change

  return (
    <Card className="flex flex-col h-full w-full">
      <CardHeader>
        <CardTitle>Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden p-0">
        <ScrollArea ref={scrollAreaRef} className="h-full p-4">
          {messages.map((message: Message) => ( 
            <div
              key={message.id} 
              className={cn(
                'mb-4 flex w-full',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'rounded-lg px-4 py-2 max-w-[80%] overflow-hidden',
                  message.role === 'user'
                    ? 'bg-white text-black'
                    : 'bg-muted'
                )}
                style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
              >
                {message.content.split('\n').map((line, index) => (
                  <React.Fragment key={index}>
                    {line}
                    {index < message.content.split('\n').length - 1 && <br />} 
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="rounded-lg px-4 py-2 bg-muted animate-pulse">
                Thinking...
              </div>
            </div>
          )}
          {error && (
            <div className="flex justify-start mb-4">
              <div className="rounded-lg px-4 py-2 bg-destructive text-destructive-foreground">
                Error: {error.message}
              </div>
            </div>
          )}
        </ScrollArea>
      </CardContent>
      <CardFooter>
        <form onSubmit={handleSubmit} className="flex w-full space-x-2">
          <Input
            value={input}
            onChange={handleInputChange} 
            placeholder="Type your message..."
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            Send
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};

export default ChatInterface;
