import React, { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Loader2, Send, Bot, Paperclip } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';

/**
 * AgentChatInterface props
 */
export interface AgentChatInterfaceProps {
  conversationId?: string;
  className?: string;
  documentContext?: any;
}

/**
 * Message type for the agent chat
 */
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentId?: string;
}

/**
 * AgentChatInterface component
 * Provides a UI for interacting with the multi-agent system
 */
const AgentChatInterface: React.FC<AgentChatInterfaceProps> = ({
  conversationId = `conv-${Date.now()}`,
  className,
  documentContext
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDoc, setUploadedDoc] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  
  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      setUploadedDoc(data.document);
      
      // Show confirmation message
      const fileMessage: Message = {
        role: 'system',
        content: `File "${file.name}" uploaded successfully and attached to this conversation.`,
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, fileMessage]);
    } catch (error) {
      console.error('Error uploading file:', error);
      const errorMessage: Message = {
        role: 'system',
        content: 'Failed to upload file. Please try again.',
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsUploading(false);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  // Trigger file input click
  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || !user || isLoading) return;
    
    // Add user message to the chat
    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      // Get the authentication token
      const token = await user.getIdToken();
      
      // Include uploaded document context if available
      const messageContext = {
        ...documentContext,
        ...(uploadedDoc && {
          fileUrl: uploadedDoc.downloadURL,
          fileName: uploadedDoc.name,
          fileType: uploadedDoc.contentType,
          fileId: uploadedDoc.id,
          storagePath: uploadedDoc.storagePath
        })
      };

      // Send the request to the agent-chat API
      const response = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query: userMessage.content,
          messages: messages,
          conversationId,
          documentContext: Object.keys(messageContext).length > 0 ? messageContext : undefined
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      // Add assistant response to the chat
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        timestamp: Date.now(),
        agentId: data.data?.agentId
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add error message
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your request.',
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={cn('flex flex-col h-[600px]', className)}>
      <CardHeader className="px-4 py-2 border-b">
        <CardTitle className="text-lg flex items-center">
          <Bot className="mr-2 h-5 w-5" />
          Accounting Assistant (Multi-Agent)
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center text-muted-foreground">
              <div>
                <Bot className="mx-auto h-12 w-12 mb-2 opacity-50" />
                <p>Ask me anything about accounting, invoices, GL codes, or reconciliation.</p>
                <p className="text-xs">I'll route your question to the appropriate specialized agent.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex flex-col max-w-[80%] rounded-lg p-3',
                    message.role === 'user'
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  {message.agentId && (
                    <div className="text-xs opacity-70 mb-1">
                      Agent: {message.agentId}
                    </div>
                  )}
                  
                  <div className="prose dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  
                  <div className="text-xs opacity-70 mt-1 self-end">
                    {format(message.timestamp, 'p')}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>
      </CardContent>
      
      <CardFooter className="p-3 border-t">
        <form onSubmit={handleSubmit} className="flex w-full space-x-2">
          {/* Hidden file input */}
          <input 
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
          />
          
          {/* File upload button */}
          <Button 
            type="button" 
            size="icon" 
            variant="outline"
            onClick={triggerFileUpload}
            disabled={isLoading || isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Paperclip className="h-5 w-5" />
            )}
          </Button>
          
          <Textarea
            placeholder="Ask about invoices, GL codes, reconciliation..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 min-h-10 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};

export default AgentChatInterface;
