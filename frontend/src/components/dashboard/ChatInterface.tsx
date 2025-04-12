import React, { useState, useRef, useEffect } from 'react'; 
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area'; 
import { cn } from '@/lib/utils'; 
import { useAuth } from '@/context/AuthContext'; 
import { Timestamp } from 'firebase/firestore'; 
import { MyDocumentData } from '@/types'; 

// Define the structure of a chat message
interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  excelOperation?: {
    success: boolean;
    message: string;
    documentId?: string;
    fileName?: string;
    url?: string;
  };
}

interface ChatInterfaceProps {
  documentId?: string; // Optional for single document chat
  document?: MyDocumentData; // Optional for single document chat
  documents?: MyDocumentData[]; // Array of documents for folder chat
  folderName?: string; // Name of the folder when chatting with a folder
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ documentId, document, documents, folderName }) => {
  // Determine if we're in folder chat mode
  const isFolderChat = !!documents && documents.length > 0;
  
  // For folder chat, we'll use the first document's ID as a reference, but send all document IDs to the API
  const chatContextId = isFolderChat ? `folder-${documents?.[0]?.id}` : documentId;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null); 
  const { user } = useAuth(); 
  
  // Reference to the active sheet for the current document
  const [activeSheet, setActiveSheet] = useState<string | null>(null);

  // Effect to check for active sheet in localStorage when document changes
  useEffect(() => {
    if (document?.id) {
      // Try to get active sheet from localStorage
      const savedSheet = localStorage.getItem(`activeSheet-${document.id}`);
      if (savedSheet) {
        console.log(`[ChatInterface] Found active sheet for document ${document.id}: ${savedSheet}`);
        setActiveSheet(savedSheet);
      } else {
        setActiveSheet(null);
      }

      // Add event listener for active sheet changes
      const handleActiveSheetChange = (event: CustomEvent) => {
        const { documentId, sheetName } = event.detail;
        if (documentId === document.id) {
          console.log(`[ChatInterface] Received active sheet change event: ${sheetName}`);
          setActiveSheet(sheetName);
        }
      };

      // Add the event listener
      window.addEventListener('activeSheetChanged', handleActiveSheetChange as EventListener);

      // Clean up the event listener when the component unmounts
      return () => {
        window.removeEventListener('activeSheetChanged', handleActiveSheetChange as EventListener);
      };
    }
  }, [document?.id]);

  // Function to handle sending a message
  const handleSend = async () => {
    if (!input.trim() || isLoading) return; 

    const userMessage: ChatMessage = {
      id: Date.now().toString(), 
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput(''); 
    setIsLoading(true);

    if (!user) {
      console.error("User not authenticated to send message");
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'ai', content: "Error: You must be logged in to chat." }]);
      setIsLoading(false);
      return;
    }
    
    // Get the ID token
    const token = await user.getIdToken();

    try {
      // === NEW: Call backend API ===
      const fetchResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Add Authorization header
        },
        body: JSON.stringify({ 
          message: userMessage.content, // Send the user's message content
          documentId: isFolderChat ? undefined : documentId,
          currentDocument: isFolderChat ? undefined : document, // Pass the full document object if available
          documents: isFolderChat ? documents : undefined, // For folder chat - array of documents
          isFolderChat: isFolderChat, // Flag to indicate folder chat mode
          folderName: isFolderChat ? folderName : undefined, // Name of the folder for context
          activeSheet: activeSheet // Include the active sheet information
        }),
      });

      console.log('--- Frontend: Received response from /api/chat ---');
      console.log('- Status:', fetchResponse.status);
      console.log('- Status Text:', fetchResponse.statusText);
      console.log('- OK:', fetchResponse.ok);
      console.log('- Headers:', Object.fromEntries(fetchResponse.headers.entries()));

      // Check if response is OK before attempting to read body
      if (!fetchResponse.ok) {
        let errorText = `Error: ${fetchResponse.status} ${fetchResponse.statusText}`;
        try {
            const errorBody = await fetchResponse.text();
            console.error("Frontend: Error response body:", errorBody);
            errorText += ` - ${errorBody}`;
        } catch (e) {
             console.error("Frontend: Could not read error response body", e);
        }
        throw new Error(errorText); // Throw error to be caught by outer catch block
      }

      let rawText = ''; // Define rawText here to be accessible in catch block
      try {
        rawText = await fetchResponse.text();
        console.log('- Frontend: Raw Response Text Before Parse:', JSON.stringify(rawText)); // Log raw text carefully

        // --- Attempt to parse ---
           const aiData = JSON.parse(rawText); 
        console.log('- Frontend: Parsed JSON data:', aiData);

         // --- NEW: Check for nested 'response' key --- 
         let messageData = aiData; // Assume top-level by default
         if (aiData && typeof aiData === 'object' && aiData.response && typeof aiData.response === 'object' && aiData.response.role) {
           console.log('- Frontend: Found nested message data under \'response\' key. Using that.');
           messageData = aiData.response; // Use the nested object
         } else {
           console.log('- Frontend: Using top-level parsed data.');
         }

         // --- Simplified Condition Check (using messageData) ---
         if (messageData && messageData.role === 'ai') {
           // Assume if role is 'ai', it's the message object we want
             const aiResponse: ChatMessage = {
               id: messageData.id || Date.now().toString(),
               role: 'ai',
             // Ensure content exists, default to empty string if not (though backend log shows it should)
             content: typeof messageData.content === 'string' ? messageData.content : '',
               excelOperation: messageData.excelOperation || undefined // Check on messageData
             };
             
             console.log('[ChatInterface] Successfully parsed AI response:', aiResponse);
             setMessages((prev) => [...prev, aiResponse]);

             let refreshTriggered = false;
              // Check for successful Excel operation
              if (messageData.excelOperation && messageData.excelOperation.success) { 
                console.log('[ChatInterface] Excel operation successful, triggering document refresh');
                
                // Trigger document viewer refresh
                window.dispatchEvent(new Event('excel-document-updated'));
                
                // If this is a new document creation (check for documentId in the response)
                if (messageData.excelOperation.documentId) {
                  // Dispatch a custom event to refresh the document list in the dashboard
                  console.log('[ChatInterface] New Excel document created, triggering document list refresh');
                  window.dispatchEvent(new CustomEvent('document-list-refresh', {
                    detail: { documentId: messageData.excelOperation.documentId }
                  }));
                }
                
                refreshTriggered = true;
              }

             // Handle marker removal (check content exists before calling includes)
             if (aiResponse.content && aiResponse.content.includes('[EXCEL_DOCUMENT_UPDATED]')) {
               if (!refreshTriggered) {
                 // Log if the marker was present but didn't trigger a refresh (should not happen often if backend is consistent)
                 console.log('[ChatInterface] Detected Excel update marker, but refresh already triggered by operation status.');
               }
               // Remove the marker from the displayed message
               setMessages((prev) => prev.map(msg => 
                 msg.id === aiResponse.id 
                   ? { ...msg, content: msg.content.replace('[EXCEL_DOCUMENT_UPDATED]', '').trim() } 
                   : msg
               ));
             }
           } else {
           // --- Logging if simplified condition fails ---
            console.error('[ChatInterface] ERROR: Final messageData object missing or role !== "ai".', messageData);
            console.error(`[ChatInterface] Check: typeof messageData = ${typeof messageData}`);
            if (typeof messageData === 'object' && messageData !== null) {
              console.error(`[ChatInterface] Check: messageData.role = ${messageData.role}, typeof = ${typeof messageData.role}`);
            }
              // --- Simplified fallback/error handling --- 
            const errorMessage = messageData?.error 
              ? `Error: ${messageData.error}` 
              : "Sorry, I received a response in an unexpected format.";
            console.error("Unknown or invalid final messageData structure:", messageData);
            setMessages((prev) => [...prev, {
              id: Date.now().toString(), 
              role: 'ai', 
              content: errorMessage
            }]);
          }
      } catch (parseError) {
         console.error('Frontend: Error parsing response JSON:', parseError);
         console.error('Frontend: Raw text that failed parse:', rawText); // Log raw text on parse failure
          setMessages((prev) => [
            ...prev, 
            {
              id: Date.now().toString(), 
              role: 'ai', 
              content: 'Sorry, I could not process the response.',
            },
          ]);
      }
    } catch (error) {
       console.error('Frontend: Error sending message or handling response:', error);
       setMessages((prev) => [
         ...prev, 
         {
           id: Date.now().toString(), 
           role: 'ai', 
           content: `Sorry, I couldn't get a response. ${error instanceof Error ? error.message : 'Unknown error'}`
         },
       ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
        const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollElement) {
             scrollElement.scrollTop = scrollElement.scrollHeight;
        }
    }
  }, [messages]);

  // Handle Enter key press in input
  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
      handleSend();
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>
          {isFolderChat 
            ? `Chat with Folder: ${folderName || 'Documents'}` 
            : `Chat with ${document?.name || 'Document'}`
          }
          {isFolderChat && documents && (
            <div className="text-xs text-muted-foreground mt-1">
              {documents.length} document{documents.length !== 1 ? 's' : ''} included
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0"> {/* Remove padding for ScrollArea */}
        <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {!user && (
              <div className="text-red-600 text-center p-4">
                Authentication error. Please log out and log back in.
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'mb-4 flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'rounded-lg px-4 py-2 max-w-[80%]',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  
                  {/* Display Excel operation result if available */}
                  {message.excelOperation && (
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <div className="text-sm font-medium">
                        {message.excelOperation.success ? (
                          <div className="flex flex-col space-y-2">
                            <span className="text-green-600 dark:text-green-400">
                              Excel file {message.excelOperation.fileName ? `"${message.excelOperation.fileName}"` : ""} 
                              {message.excelOperation.documentId ? "updated" : "created"} successfully
                            </span>
                            {message.excelOperation.url && (
                              <a 
                                href={message.excelOperation.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Download Excel File
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-red-600 dark:text-red-400">
                            Error: {message.excelOperation.message}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center space-x-2">
                 <div className="bg-muted rounded-lg px-3 py-2 text-sm">Typing...</div>
              </div>
            )} 
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 border-t">
        <div className="flex w-full items-center space-x-2">
          <Input 
            placeholder="Ask something about the document..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress} 
            disabled={isLoading} 
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
            {isLoading ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default ChatInterface;
