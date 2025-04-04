import React, { useState, useRef, useEffect } from 'react'; 
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area'; 
import { cn } from '@/lib/utils'; 
import { useAuth } from '@/context/AuthContext'; 

// Define the structure of a chat message
interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

// Define the structure of a document passed as a prop
interface MyDocumentData {
  id: string;
  userId: string;
  name: string;
  storagePath: string;
  uploadedAt: any; 
  contentType: string;
  status: string;
  downloadURL?: string;
  size?: number; 
}

interface ChatInterfaceProps {
  document: MyDocumentData;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ document }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null); 
  const { user } = useAuth(); 

  // Function to handle sending a message
  const handleSend = async () => {
    if (!input.trim()) return; 

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
          documentId: document.id      // Send the ID of the current document
        }),
      });

      console.log('Received response from /api/chat');
      console.log('- Status:', fetchResponse.status);
      console.log('- Status Text:', fetchResponse.statusText);
      console.log('- OK:', fetchResponse.ok);
      console.log('- Headers:', Object.fromEntries(fetchResponse.headers.entries()));

      // Attempt to read as text first for debugging
      try {
        const rawText = await fetchResponse.text();
        console.log('- Raw Response Text:', rawText);

        // Now try to parse the raw text as JSON
        const aiData = JSON.parse(rawText); 
        console.log('- Parsed JSON data:', aiData);

        // Original check:
        if (aiData && aiData.response && aiData.response.role === 'ai') {
          const aiResponse: ChatMessage = { 
            id: aiData.response.id || Date.now().toString(), 
            role: 'ai', 
            content: aiData.response.content 
          };
          setMessages((prev) => [...prev, aiResponse]);
        } else {
          console.error("Invalid AI response structure after parsing:", aiData);
          setMessages((prev) => [...prev, {id: Date.now().toString(), role: 'ai', content: "Sorry, I received an invalid response structure."}]);
        }
      } catch (parseError) {
        console.error('Error parsing response JSON:', parseError);
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
      console.error('Error sending message:', error);
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
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>Chat with: {document.name}</CardTitle>
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
                  "flex max-w-[75%] flex-col gap-2 rounded-lg px-3 py-2 text-sm whitespace-normal break-words",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {message.content}
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
