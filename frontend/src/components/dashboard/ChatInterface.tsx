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

interface ChatInterfaceProps {
  documentId: string;
  document?: MyDocumentData; 
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ documentId, document }) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null); 
  const { user } = useAuth(); 
  
  const [activeSheet, setActiveSheet] = useState<string | null>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } = useChat({
    api: '/api/chat', 
    id: documentId, 
    body: {
      documentId: documentId,
      currentDocument: document, 
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
      setTimeout(() => {
        if (scrollAreaRef.current) { 
          scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
      }, 0);
    }
  }, [messages]);

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
                'mb-4 flex',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'rounded-lg px-4 py-2',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
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
