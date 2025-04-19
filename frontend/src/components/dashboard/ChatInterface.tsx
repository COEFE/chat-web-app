import React, { useState, useRef, useEffect } from 'react'; 
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea'; // Import Textarea
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area'; 
import { cn } from '@/lib/utils'; 
import { useAuth } from '@/context/AuthContext'; 
import { Timestamp } from 'firebase/firestore'; 
import { MyDocumentData } from '@/types'; 
import { useChat, type Message } from '@ai-sdk/react';
import { Loader2, Send } from 'lucide-react'; // Import Loader2 and Send icons
import { getFirestore, collection, query, orderBy, getDocs, } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown'; // Import ReactMarkdown
import remarkGfm from 'remark-gfm'; // Import remark-gfm for GitHub Flavored Markdown
import { format } from 'date-fns'; // Import date-fns for formatting

interface ChatInterfaceProps {
  documentId: string; // Primary/active document ID
  document?: MyDocumentData;
  // Optional additional properties for multi-document support
  additionalDocuments?: MyDocumentData[];
  isReadOnly?: boolean; // Add optional read-only prop
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ documentId, document, additionalDocuments = [], isReadOnly = false }) => {
  // Combine primary document with additional documents for context
  const allDocuments = document ? [document, ...additionalDocuments] : additionalDocuments;
  // Get all document IDs for the API call
  const allDocumentIds = allDocuments.map(doc => doc.id);
  const scrollAreaRef = useRef<HTMLDivElement>(null); 
  const { user } = useAuth(); 
  const submitButtonRef = useRef<HTMLButtonElement>(null); // Ref for the submit button
  const [authToken, setAuthToken] = useState<string | null>(null); // State for auth token

  const [activeSheet, setActiveSheet] = useState<string | null>(null);

  // Helper to check if the document is likely an Excel file
  const isExcel = (doc?: MyDocumentData) => {
    return doc?.contentType?.includes('spreadsheetml') || doc?.name?.endsWith('.xlsx');
  };

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
  }, [messages, scrollAreaRef]);

  // Handle keydown events for Textarea (Enter to submit, Shift+Enter for newline)
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Prevent default newline on Enter
      // Trigger form submission by clicking the button
      if (submitButtonRef.current && !submitButtonRef.current.disabled) {
        submitButtonRef.current.click();
      }
    }
  };

  return (
    <Card className="flex flex-col h-full w-full">
      <CardHeader className="p-3 sm:p-4"> {/* Responsive padding */}
        <CardTitle 
          className="truncate" 
          title={document?.name ? `Chat with ${document.name}${additionalDocuments.length > 0 ? ` (+${additionalDocuments.length} more)` : ''}` : 'Chat'}
        >
          {document?.name ? `Chat with ${document.name}` : 'Chat'}
          {additionalDocuments.length > 0 && (
            <span className="text-muted-foreground text-sm ml-1">
              (+{additionalDocuments.length} more)
            </span>
          )}
        </CardTitle>
        {isExcel(document) && activeSheet && (
          <CardDescription>Active Sheet: {activeSheet}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 min-h-0"> {/* Use flex-1 and min-h-0 */}
        <ScrollArea ref={scrollAreaRef} className="h-full">
          <div className="p-3 sm:p-4"> {/* Responsive padding for scroll area content */}
            {/* Placeholder for empty chat */}
            {!isLoading && messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <p className="text-muted-foreground">
                  Ask me anything about {document?.name ? `"${document.name}"` : 'the document'}.
                </p>
              </div>
            )}
            {messages.map((message: Message) => (
              <div
                key={message.id} // Outer container for the row alignment
                className={cn(
                  "flex mb-3 sm:mb-4", // Responsive margin
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div className={cn( // Inner container for vertical stacking (bubble + timestamp)
                  "flex flex-col",
                  message.role === 'user' ? 'items-end' : 'items-start'
                )}>
                  <div
                    // The actual message bubble
                    className={cn(
                      'rounded-lg px-4 py-2 max-w-[80%] overflow-hidden',
                      message.role === 'user'
                        ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50'
                        : 'bg-primary text-primary-foreground'
                    )}
                  >
                    <div
                      // Prose wrapper for Markdown styling
                      className="prose prose-sm max-w-none dark:prose-invert prose-p:my-0 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1"
                      style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({node, ...props}) => <a className="text-blue-600 underline dark:text-blue-400" {...props} />,
                          p: ({node, ...props}) => <p className="mb-0" {...props} />
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                  {message.createdAt && (
                    <div className="text-xs text-muted-foreground mt-1 px-1"> {/* Simple styling, alignment handled by parent */}
                      {format(message.createdAt, 'p P')}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && (
              <div className="flex justify-start mb-4">
                <div className="rounded-lg px-4 py-2 bg-destructive text-destructive-foreground">
                  Error: {error.message}
                </div>
              </div>
            )}
          </div> {/* End padding div */}
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-3 sm:p-4"> {/* Responsive padding */}
        <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
          <Textarea
            value={input}
            onChange={handleInputChange}
            placeholder={isReadOnly ? "Chat is read-only" : "Type your message..."} // Change placeholder when read-only
            disabled={isLoading || isReadOnly} // Disable input if read-only
            onKeyDown={handleKeyDown} // Add keydown handler
            className="flex-1 resize-none" // Use resize-none for now
            rows={1} // Start with a single row
          />
          <Button ref={submitButtonRef} type="submit" size="icon" disabled={isLoading || !input.trim() || isReadOnly} aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};

export default ChatInterface;
