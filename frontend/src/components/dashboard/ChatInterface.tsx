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

export interface ChatInterfaceProps { 
  chatId: string; 
  userId: string; // Make userId required
  linkedDocuments?: MyDocumentData[]; // Accept all linked documents
  isReadOnly?: boolean; 
  className?: string; 
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  chatId, 
  userId, // Destructure userId
  linkedDocuments = [], // Use linkedDocuments, default to empty array
  isReadOnly = false, 
  className 
}) => {
  // Use linkedDocuments directly
  const allDocumentIds = linkedDocuments.map(doc => doc.id); 
  // Find the primary document if needed (e.g., for context - assuming first is primary for now)
  // Note: This assumption might need refinement based on how 'activeDocument' is determined upstream
  const primaryDocument = linkedDocuments.length > 0 ? linkedDocuments[0] : undefined;

  const scrollAreaRef = useRef<HTMLDivElement>(null); 
  const scrollableRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null); 
  const submitButtonRef = useRef<HTMLButtonElement>(null); // Ref for the submit button
  const { user } = useAuth(); // Call useAuth at the top level
  const [authToken, setAuthToken] = useState<string | null>(null); // State for auth token

  const [activeSheet, setActiveSheet] = useState<string | null>(null);

  // Helper to check if the document is likely an Excel file
  const isExcel = (doc?: MyDocumentData) => {
    // Check primary document or maybe any linked document?
    // For now, checking the primary one.
    return doc?.contentType?.includes('spreadsheetml') || doc?.name?.endsWith('.xlsx');
  };

  // Effect to fetch the auth token when the user object changes
  useEffect(() => {
    // Fetch the auth token when the user object changes.
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

  // --- Prepare Document Context for API (only if document exists) --- 
  // Use primaryDocument and userId prop
  const documentContext = primaryDocument && userId && primaryDocument.storagePath && primaryDocument.contentType
    ? {
        storagePath: primaryDocument.storagePath,
        contentType: primaryDocument.contentType,
        name: primaryDocument.name,
        userId: userId, // Use userId prop
      }
    : undefined;

  // Initialize useChat hook - provides messages, setMessages, etc.
  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } = useChat({
    api: '/api/chat',
    id: chatId, // Use chatId as the unique ID for the chat session
    initialMessages: [], // Explicitly start with empty messages
    // Pass the prepared headers object (or undefined)
    headers: chatHeaders, 
    body: {
      chatId: chatId, // Always include chatId
      // Pass all linked document IDs
      ...(allDocumentIds.length > 0 && { linkedDocumentIds: allDocumentIds }), 
      // Pass all linked documents data
      ...(linkedDocuments.length > 0 && { linkedDocuments: linkedDocuments }),
      // Note: activeSheet logic might need review if it depends on the 'primary' document concept
      ...(activeSheet && primaryDocument && { activeSheet: activeSheet }), 
      ...(documentContext && { documentContext: documentContext }),
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

  // Effect to load chat history when chatId or user changes
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!chatId || !userId) { // Use userId prop
        console.log('[ChatInterface] No chatId or user, clearing messages.');
        setMessages([]); // Clear history if no chat or user
        return;
      }

      console.log(`[ChatInterface] Attempting to load chat history for chat: ${chatId}`);
      const db = getFirestore();
      // Assuming messages are stored directly under the chat
      const messagesPath = `users/${userId}/chats/${chatId}/messages`; // Use userId prop

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
  }, [chatId, userId, setMessages]); // Use userId prop in dependency array

  useEffect(() => {
    // Update active sheet logic based on primaryDocument
    if (primaryDocument?.id) { 
      const savedSheet = localStorage.getItem(`activeSheet-${primaryDocument.id}`);
      if (savedSheet) {
        console.log(`[ChatInterface] Found active sheet for document ${primaryDocument.id}: ${savedSheet}`);
        setActiveSheet(savedSheet);
      } else {
        setActiveSheet(null);
      }

      const handleActiveSheetChange = (event: CustomEvent) => {
        const { documentId: eventDocId, sheetName } = event.detail;
        if (eventDocId === primaryDocument.id) {
          console.log(`[ChatInterface] Received active sheet change event: ${sheetName}`);
          setActiveSheet(sheetName);
        }
      };
      window.addEventListener('activeSheetChanged', handleActiveSheetChange as EventListener);
      return () => {
        window.removeEventListener('activeSheetChanged', handleActiveSheetChange as EventListener);
      };
    }
  }, [primaryDocument?.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };
    
    // Small delay to ensure DOM update is complete
    const timeoutId = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timeoutId);
  }, [messages]);

  // Handle keydown events for Textarea (Enter to submit, Shift+Enter for newline)
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Prevent default newline on Enter
      // Trigger form submission by clicking the button
      if (submitButtonRef.current && !submitButtonRef.current.disabled) {
        submitButtonRef.current.click();
        // Extra scroll to bottom on submit to ensure visibility
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  };

  return (
    <Card className={cn("flex flex-col h-full w-full bg-background", className)}> {/* Combined changes */}
      <CardHeader className="p-0 pl-3"> {/* Added left padding to align with chat bubbles */}
        <CardTitle 
          className="truncate" 
          title={primaryDocument?.name ? `Chat with ${primaryDocument.name}${linkedDocuments.length > 0 ? ` (+${linkedDocuments.length} more)` : ''}` : 'Chat'}
        >
          {primaryDocument?.name ? `Chat with ${primaryDocument.name}` : 'Chat'}
          {linkedDocuments.length > 0 && (
            <span className="text-muted-foreground text-sm ml-1">
              (+{linkedDocuments.length} more)
            </span>
          )}
        </CardTitle>
        {isExcel(primaryDocument) && activeSheet && (
          <CardDescription>Active Sheet: {activeSheet}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 min-h-0"> {/* Use flex-1 and min-h-0 */}
        <ScrollArea ref={scrollAreaRef} className="h-full"> {/* Restored h-full for proper scrolling */}
          <div className="py-0 px-3" ref={scrollableRef}> {/* Added horizontal padding */}
            {/* Placeholder for empty chat */}
            {!isLoading && messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <p className="text-muted-foreground">
                  Ask me anything about {primaryDocument?.name ? `"${primaryDocument.name}"` : 'the document'}.
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
            {/* Messages end marker for scrolling */}
            <div ref={messagesEndRef} style={{ height: '1px', width: '100%' }} />
          </div> {/* End padding div */}
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-0 border-t"> {/* Removed padding for input container */}
        <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
          <Textarea
            value={input}
            onChange={handleInputChange}
            placeholder={isReadOnly ? "Chat is read-only" : "Type your message..."} // Change placeholder when read-only
            disabled={isLoading || isReadOnly} // Disable input if read-only
            onKeyDown={handleKeyDown} // Add keydown handler
            className="flex-1 resize-none min-h-[40px] max-h-[80px] py-2" // Constrained height, reduced padding
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
