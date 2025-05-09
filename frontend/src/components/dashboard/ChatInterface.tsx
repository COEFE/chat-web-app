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
import { getFirestore, collection, query, orderBy, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown'; // Import ReactMarkdown
import remarkGfm from 'remark-gfm'; // Import remark-gfm for GitHub Flavored Markdown
import { format } from 'date-fns'; // Import date-fns for formatting
import Link from 'next/link'; // Import Link for navigation

export interface ChatInterfaceProps { 
  chatId: string; 
  userId: string; // Make userId required
  linkedDocuments?: MyDocumentData[]; // Accept all linked documents
  isReadOnly?: boolean; 
  className?: string; 
  initialMessage?: string; // Add initialMessage for transaction queries
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  chatId, 
  userId, // Destructure userId
  linkedDocuments = [], // Use linkedDocuments, default to empty array
  isReadOnly = false, 
  className,
  initialMessage
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
        id: primaryDocument.id,
        storagePath: primaryDocument.storagePath,
        contentType: primaryDocument.contentType,
        name: primaryDocument.name,
        userId: userId, // Use userId prop to validate on server
      }
    : undefined;

  // Initialize useChat hook - provides messages, setMessages, etc.
  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages, setInput } = useChat({
    api: '/api/chat',
    id: chatId, // Use chatId as the unique ID for the chat session
    initialMessages: [], // Explicitly start with empty messages
    // Pass the prepared headers object (or undefined)
    headers: chatHeaders, 
    body: {
      chatId: chatId, // Always include chatId
      ...(primaryDocument && { documentId: primaryDocument.id }),
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

  // Firestore instance and flag to track initial load
  const firestoreDb = getFirestore();
  const initialLoad = useRef(true);

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
        initialLoad.current = false;

      } catch (err) {
        console.error('[ChatInterface] Error loading chat history:', err);
        setMessages([]); // Clear messages on error
        // Consider setting an error state to display to the user here
      }
    };

    loadChatHistory();
  }, [chatId, userId, setMessages]); // Use userId prop in dependency array

  // Persist new messages after initial load
  useEffect(() => {
    if (initialLoad.current) return;
    if (!chatId || !userId) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;
    const msgRef = doc(firestoreDb, 'users', userId, 'chats', chatId, 'messages', lastMsg.id);
    setDoc(msgRef, {
      role: lastMsg.role,
      content: lastMsg.content,
      createdAt: serverTimestamp(),
    });
  }, [messages, chatId, userId]);

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

  // Effect to scroll to bottom of chat when messages change
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
  
  // Effect to set initialMessage if provided
  useEffect(() => {
    if (initialMessage && initialMessage.trim() !== '') {
      // Set the input field with the initial message
      setInput(initialMessage);
    }
  }, [initialMessage, setInput]);

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
            {messages.map((message: Message) => {
              // --- START: Excel Operation Feedback Logic ---
              let isExcelToolCall = false;
              let isExcelToolResult = false;
              let excelResultData: any = null;

              // Check if it's an assistant initiating the excel tool call
              if (message.role === 'assistant' && message.toolInvocations) {
                isExcelToolCall = message.toolInvocations.some(
                  (tool) => tool.toolName === 'excelOperation'
                );
              }

              // Check if it's the result of the excel tool call
              // Adjusted check to avoid role === 'tool' comparison due to TS type mismatch
              // Use type assertion 'as any' because toolName exists at runtime but not in official Message type
              if ((message as any).toolName === 'excelOperation') {
                isExcelToolResult = true;
                try {
                  // Use type assertion 'as any' because content holds JSON string for tool result
                  excelResultData = JSON.parse((message as any).content);
                } catch (e) {
                  console.error("[ChatInterface] Failed to parse excel tool result:", e);
                  // Keep excelResultData null or set an error flag
                  excelResultData = { success: false, message: "Failed to parse tool result." };
                }
              }
              // --- END: Excel Operation Feedback Logic ---

              // --- Render based on message type ---
              
              // 1. Render Excel Tool Result (Formatted)
              if (isExcelToolResult && excelResultData) {
                return (
                  <div key={message.id} className="flex justify-start mb-3 sm:mb-4">
                    <div className="flex flex-col items-start">
                      <div
                        className={cn(
                          'rounded-lg px-4 py-2 max-w-[80%] overflow-hidden shadow-md',
                          excelResultData.success
                            ? 'bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100'
                            : 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100'
                        )}
                      >
                        <p className="mb-0">{excelResultData.message}</p>
                        {excelResultData.success && excelResultData.documentId && (
                          <Link href={`/document-chat/${excelResultData.documentId}`}>
                            <Button variant="link" className="p-0 h-auto text-blue-600 dark:text-blue-400 underline">
                              View Document
                            </Button>
                          </Link>
                        )}
                        {/* Optional: Display execution time? */}
                        {/* {excelResultData.executionTime && <p className="text-xs mt-1">Time: {excelResultData.executionTime}ms</p>} */} 
                      </div>
                      {message.createdAt && (
                         <div className="text-xs text-muted-foreground mt-1 px-1"> 
                          {format(message.createdAt, 'p P')} (System Process)
                         </div>
                       )}
                    </div>
                  </div>
                );
              }

              // 2. Render Normal User/Assistant Messages (or Loading state for Excel call)
              // Don't render the raw 'tool' role message if we handled it above
              // Keep this check as toolName check above handles the rendering
              // Use type assertion 'as any' because role 'tool' exists at runtime but not in official Message type
              if ((message as any).role === 'tool') return null; 

              return (
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
                       {/* START: Conditional content: Loading or Markdown */} 
                      {isExcelToolCall ? (
                        <div className="flex items-center text-muted-foreground">
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing Excel request...
                        </div>
                      ) : (
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
                       )} 
                       {/* END: Conditional content */} 
                    </div>
                    {message.createdAt && (
                      <div className="text-xs text-muted-foreground mt-1 px-1"> {/* Simple styling, alignment handled by parent */} 
                        {format(message.createdAt, 'p P')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
