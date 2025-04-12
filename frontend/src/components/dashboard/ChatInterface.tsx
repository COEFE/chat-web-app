import React, { useState, useRef, useEffect } from 'react'; 
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area'; 
import { cn } from '@/lib/utils'; 
import { useAuth } from '@/context/AuthContext'; 
import { Timestamp } from 'firebase/firestore'; 
import { MyDocumentData } from '@/types'; 
// Import the useChat hook from the Vercel AI SDK
import { useChat, type Message } from 'ai/react';

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
  documentId: string;
  document?: MyDocumentData; 
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ documentId, document }) => {
  // Use the useChat hook from the Vercel AI SDK
  const { user } = useAuth();
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  // Get token for authorization
  const [authHeader, setAuthHeader] = useState<Record<string, string>>({});

  // Effect to update auth header when user changes
  useEffect(() => {
    const updateAuthHeader = async () => {
      if (user) {
        try {
          const token = await user.getIdToken();
          setAuthHeader({ 'Authorization': `Bearer ${token}` });
        } catch (error) {
          console.error('Error getting auth token:', error);
          setAuthHeader({});
        }
      } else {
        setAuthHeader({});
      }
    };
    
    updateAuthHeader();
  }, [user]);
  
  // Initialize the useChat hook
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error
  } = useChat({
    api: '/api/chat', // API endpoint
    initialMessages: [], // Start with empty messages
    // Pass additional data with each request
    body: {
      documentId,
      currentDocument: document,
      activeSheet
    },
    // Use the pre-fetched auth header
    headers: authHeader,
    // Handle errors
    onError: (error: Error) => {
      console.error('Chat error:', error);
    }
  });

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

  // Effect to scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Check for Excel operations in the latest message
  useEffect(() => {
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      
      // Only process assistant messages
      if (latestMessage.role === 'assistant') {
        // Check for Excel operation markers in the content
        if (typeof latestMessage.content === 'string' && latestMessage.content.includes('[EXCEL_DOCUMENT_UPDATED]')) {
          console.log('[ChatInterface] Detected Excel update marker, triggering refresh');
          window.dispatchEvent(new Event('excel-document-updated'));
          
          // Remove the marker from the displayed message (handled by the AI SDK)
        }
      }
    }
  }, [messages]);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>Chat with Document ID: {documentId}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[calc(100vh-13rem)]" ref={scrollAreaRef}>
          <div className="p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Ask a question about your document...
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex flex-col space-y-2 p-4 rounded-lg",
                    message.role === 'user'
                      ? "bg-primary text-primary-foreground ml-8"
                      : "bg-muted mr-8"
                  )}
                >
                  <div className="text-sm font-semibold">
                    {message.role === 'user' ? 'You' : 'AI'}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex flex-col space-y-2 p-4 rounded-lg bg-muted mr-8">
                <div className="text-sm font-semibold">AI</div>
                <div className="text-sm">Thinking...</div>
              </div>
            )}
            {error && (
              <div className="flex flex-col space-y-2 p-4 rounded-lg bg-destructive text-destructive-foreground mr-8">
                <div className="text-sm font-semibold">Error</div>
                <div className="text-sm">{error.message}</div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 border-t">
        <form 
          onSubmit={handleSubmit} 
          className="flex w-full space-x-2"
        >
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="Type your message..."
            disabled={isLoading || !user}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim() || !user}>
            Send
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};

export default ChatInterface;
