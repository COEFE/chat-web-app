import React, { useState, useRef, useEffect } from 'react'; 
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area'; 
import { cn } from '@/lib/utils'; 
import { useAuth } from '@/context/AuthContext'; 
import { Timestamp } from 'firebase/firestore'; 
import { MyDocumentData } from '@/types'; 
import { Loader2 } from 'lucide-react'; // Import Loader2

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
  primaryDocumentId: string | null; 
  selectedDocuments: MyDocumentData[]; 
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ primaryDocumentId, selectedDocuments }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null); 
  const { user } = useAuth(); 
  
  // Reference to the active sheet for the current document
  const [activeSheet, setActiveSheet] = useState<string | null>(null);

  // Effect to check for active sheet in localStorage when document changes
  useEffect(() => {
    if (primaryDocumentId) { 
      const storedSheet = localStorage.getItem(`activeSheet_${primaryDocumentId}`);
      if (storedSheet) {
        setActiveSheet(storedSheet);
      } else {
        setActiveSheet(null);
        localStorage.removeItem(`activeSheet_${primaryDocumentId}`);
      }
    }
  }, [primaryDocumentId]); 

  // Function to handle sending a message
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !user) return;

    const userMessage: ChatMessage = { id: Date.now().toString(), role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    // Get the currently active sheet for the primary document (if applicable)
    const currentActiveSheet = primaryDocumentId ? localStorage.getItem(`activeSheet_${primaryDocumentId}`) : null;
    console.log(`[ChatInterface] Sending request with activeSheet for primaryDoc (${primaryDocumentId}): ${currentActiveSheet}`);

    // --- Prepare data for API --- 
    const selectedDocumentIds = selectedDocuments.map(doc => doc.id);
    console.log('[ChatInterface] Sending request for selected document IDs:', selectedDocumentIds);

    try {
      // Get the Firebase ID token for authentication
      const token = await user.getIdToken();

      // === NEW: Call backend API ===
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, 
        },
        body: JSON.stringify({
          messages: [...messages, userMessage], 
          documentIds: selectedDocumentIds, 
          primaryDocumentId: primaryDocumentId, 
          activeSheet: currentActiveSheet, 
        }),
      });

      console.log('--- Frontend: Received response from /api/chat ---');
      console.log('- Status:', response.status);
      console.log('- Status Text:', response.statusText);
      console.log('- OK:', response.ok);
      console.log('- Headers:', Object.fromEntries(response.headers.entries()));

      // Check if response is OK before attempting to read body
      if (!response.ok) {
        let errorText = `Error: ${response.status} ${response.statusText}`;
        try {
            const errorBody = await response.text();
            console.error("Frontend: Error response body:", errorBody);
            errorText += ` - ${errorBody}`;
        } catch (e) {
             console.error("Frontend: Could not read error response body", e);
        }
        throw new Error(errorText); 
      }

      let rawText = ''; 
      try {
        rawText = await response.text();
        console.log('- Frontend: Raw Response Text Before Parse:', JSON.stringify(rawText)); 

        // --- Attempt to parse ---
           const aiData = JSON.parse(rawText); 
        console.log('- Frontend: Parsed JSON data:', aiData);

         // --- NEW: Check for nested 'response' key --- 
         let messageData = aiData; 
         if (aiData && typeof aiData === 'object' && aiData.response && typeof aiData.response === 'object' && aiData.response.role) {
           console.log('- Frontend: Found nested message data under \'response\' key. Using that.');
           messageData = aiData.response; 
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
               excelOperation: messageData.excelOperation || undefined 
             };
             
             console.log('[ChatInterface] Successfully parsed AI response:', aiResponse);
             setMessages((prev) => [...prev, aiResponse]);

             let refreshTriggered = false;
             // Check for successful Excel operation
             if (messageData.excelOperation && messageData.excelOperation.success) { 
               console.log('[ChatInterface] Excel operation successful, triggering document refresh');
               window.dispatchEvent(new Event('excel-document-updated'));
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
         console.error('Frontend: Raw text that failed parse:', rawText); 
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

  // LOGGING: Check props received
  console.log('[ChatInterface] Rendered. Received selectedDocuments count:', selectedDocuments.length);

  // LOGGING: Check disabled condition
  const isDisabled = isLoading || selectedDocuments.length === 0;
  console.log(`[ChatInterface] isDisabled check: isLoading=${isLoading}, selectedDocuments.length=${selectedDocuments.length}, Result=${isDisabled}`);

  return (
    <Card className="flex flex-col h-full w-full border-t-0 rounded-t-none">
      <CardHeader>
        <CardTitle>Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden p-0"> 
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
      <CardFooter>
        <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
          <Input
            id="message"
            placeholder={selectedDocuments.length > 0 ? "Ask about selected documents..." : "Select documents to start chatting..."} 
            className="flex-1"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            // Use the logged variable for clarity
            disabled={isDisabled} 
          />
          <Button 
            type="submit" 
            size="icon" 
            // Use the logged variable for clarity
            disabled={isDisabled || !input.trim()}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};

export default ChatInterface;
