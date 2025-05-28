"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Bot, User, Loader2, MessageSquare, DollarSign, Receipt, FileText, BarChart3 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AgentContext } from '@/types/agents';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  isLoading?: boolean;
}

interface ChatBotInterfaceProps {
  className?: string;
}

const ChatBotInterface: React.FC<ChatBotInterfaceProps> = ({ className = '' }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Welcome message
  useEffect(() => {
    const welcomeMessage: Message = {
      id: 'welcome',
      content: `👋 Hi there! I'm your financial assistant. I can help you with:

📊 **Financial Data & Insights** - Ask about your spending patterns, top vendors, or monthly summaries
💰 **Expense Categories** - Organize and reclassify your expenses into the right categories
🧾 **Receipt Questions** - Get information about your receipts and expenses
💳 **Transaction Inquiries** - Review your transaction history and patterns

What would you like to know or do today?`,
      sender: 'bot',
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);
  }, []);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || !user) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: '',
      sender: 'bot',
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const context: AgentContext = {
        userId: user.uid,
        query: inputValue.trim(),
      };

      const idToken = await user.getIdToken();
      
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query: inputValue.trim(),
          idToken 
        }),
      });

      const data = await response.json();

      // Remove loading message and add bot response
      setMessages(prev => {
        const withoutLoading = prev.filter(msg => !msg.isLoading);
        const botMessage: Message = {
          id: Date.now().toString(),
          content: data.message,
          sender: 'bot',
          timestamp: new Date(),
        };
        return [...withoutLoading, botMessage];
      });
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Remove loading message and add error message
      setMessages(prev => {
        const withoutLoading = prev.filter(msg => !msg.isLoading);
        const errorMessage: Message = {
          id: Date.now().toString(),
          content: "I'm sorry, I encountered an error while processing your request. Please try again.",
          sender: 'bot',
          timestamp: new Date(),
        };
        return [...withoutLoading, errorMessage];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickActions = [
    {
      label: "Monthly Summary",
      icon: BarChart3,
      query: "Show me my spending summary for this month"
    },
    {
      label: "Top Vendors",
      icon: Receipt,
      query: "What are my top 5 vendors by spending?"
    },
    {
      label: "Organize Expenses",
      icon: FileText,
      query: "Help me organize my expenses into categories"
    },
    {
      label: "How It Works",
      icon: MessageSquare,
      query: "How can you help me manage my finances?"
    }
  ];

  const handleQuickAction = (query: string) => {
    setInputValue(query);
  };

  return (
    <Card className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
        <div className="flex items-center space-x-2">
          <Bot className="h-6 w-6 text-blue-600" />
          <h2 className="text-lg font-semibold">Financial Assistant</h2>
        </div>
        <div className="text-sm text-gray-500">
          {messages.length > 1 ? `${messages.length - 1} messages` : 'New chat'}
        </div>
      </div>

      <ScrollArea className="flex-1 p-4 min-h-0" ref={scrollAreaRef}>
        <div className="space-y-4 pb-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start space-x-3 ${
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.sender === 'bot' && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-blue-100 text-blue-600">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.sender === 'user'
                    ? 'bg-blue-600 text-white ml-auto'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                }`}
              >
                {message.isLoading ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {message.content}
                  </div>
                )}
                <div className="text-xs opacity-70 mt-1">
                  {message.timestamp.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </div>
              </div>

              {message.sender === 'user' && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-gray-100 text-gray-600">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        {messages.length === 1 && (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              Quick actions to get started:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {quickActions.map((action, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="justify-start h-auto p-3 text-left"
                  onClick={() => handleQuickAction(action.query)}
                >
                  <action.icon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="text-sm">{action.label}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>

      <div className="p-4 border-t flex-shrink-0">
        <div className="flex space-x-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about your finances..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default ChatBotInterface;
