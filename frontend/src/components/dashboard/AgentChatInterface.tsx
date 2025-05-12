import React, { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Loader2, Send, Bot, FileText, ImageIcon, FileSpreadsheet } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import FileUploadButton from '@/components/FileUploadButton';
import ChatAttachment from '@/components/ChatAttachment';

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
  attachments?: Array<{
    name: string;
    type: string;
    base64Data: string;
    size: number;
  }>;
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
  const [attachment, setAttachment] = useState<{
    name: string;
    type: string;
    base64Data: string;
    size: number;
  } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  
  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle PDF attachment
  const handleFileSelect = (fileData: {
    name: string;
    type: string;
    base64Data: string;
    size: number;
  }) => {
    setAttachment(fileData);
    
    // Show confirmation message
    const fileMessage: Message = {
      role: 'system',
      content: `File "${fileData.name}" attached to this conversation.`,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, fileMessage]);
  };
  
  // Clear file attachment
  const handleClearAttachment = () => {
    setAttachment(null);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!input.trim() && !attachment) || !user || isLoading) return;
    
    // Add user message to the chat
    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
      attachments: attachment ? [attachment] : undefined
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      // Get the authentication token
      const token = await user.getIdToken();
      
      // Prepare request data
      const requestData = {
        query: userMessage.content,
        conversationId,
        messages: messages,
        documentContext,
        attachments: userMessage.attachments
      };

      // Send the request to the agent-chat API
      const response = await fetch(`/api/agent-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestData)
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
    <Card className={cn('flex flex-col h-[calc(100vh-130px)] sm:h-[600px] w-full', className)}>
      <CardHeader className="px-3 py-2 border-b sm:px-4">
        <CardTitle className="text-lg flex items-center">
          <Bot className="mr-2 h-5 w-5" />
          Accounting Assistant (Multi-Agent)
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full p-3 sm:p-4" ref={scrollAreaRef}>
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center text-muted-foreground">
              <div className="px-2">
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
                    'flex flex-col rounded-lg p-3',
                    message.role === 'user'
                      ? 'ml-auto bg-primary text-primary-foreground max-w-[85%] sm:max-w-[80%]'
                      : 'bg-muted max-w-[85%] sm:max-w-[80%]'
                  )}
                >
                  {message.agentId && (
                    <div className="text-xs opacity-70 mb-1">
                      Agent: {message.agentId}
                    </div>
                  )}
                  
                  {/* Display attachments if they exist */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mb-2">
                      {message.attachments.map((attachment, i) => (
                        <div 
                          key={i} 
                          className={cn(
                            'flex items-center gap-2 p-2 rounded mb-2',
                            message.role === 'user' 
                              ? 'bg-primary-foreground/20 text-primary-foreground' 
                              : 'bg-background/90'
                          )}
                        >
                          {(() => {
                            // Get file extension
                            const fileExt = attachment.name.split('.').pop()?.toLowerCase() || '';
                            
                            // Show appropriate icon based on file type
                            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
                              return <ImageIcon className="h-4 w-4" />;
                            } else if (['xlsx', 'xls', 'csv'].includes(fileExt)) {
                              return <FileSpreadsheet className="h-4 w-4" />;
                            } else {
                              return <FileText className="h-4 w-4" />;
                            }
                          })()}
                          <div className="text-xs font-medium truncate">
                            {attachment.name} ({(attachment.size / (1024 * 1024)).toFixed(1)} MB)
                          </div>
                        </div>
                      ))}
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
      
      <CardFooter className="p-2 sm:p-3 border-t">
        <form onSubmit={handleSubmit} className="flex w-full space-x-1 sm:space-x-2">
          {/* File upload button - More compact on mobile */}
          <div className="flex-shrink-0">
            <FileUploadButton
              onFileSelect={handleFileSelect}
              onClear={handleClearAttachment}
              selectedFile={attachment ? { name: attachment.name, size: attachment.size } : null}
              disabled={isLoading}
            />
          </div>
          
          {/* Input field - Responsive height */}
          <div className="flex-1 min-w-0"> {/* min-width: 0 prevents overflow */}
            <Textarea
              placeholder="Ask about invoices, GL codes..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full min-h-[40px] max-h-24 resize-none text-sm sm:text-base py-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              disabled={isLoading}
            />
          </div>
          
          {/* Submit button - Slightly larger touch target on mobile */}
          <div className="flex-shrink-0 self-end">
            <Button 
              type="submit" 
              size="icon" 
              disabled={isLoading}
              className="h-[40px] w-[40px]">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </form>
      </CardFooter>
    </Card>
  );
};

export default AgentChatInterface;
