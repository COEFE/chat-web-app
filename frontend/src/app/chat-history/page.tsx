'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, MessageSquare, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Define a type for the message structure coming from the API
interface HistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  userId: string;
  documentId: string;
  createdAt: string | null; // ISO string or null
  excelFileUrl?: string;
}

interface GroupedMessages {
  [documentId: string]: HistoryMessage[];
}

export default function ChatHistoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/chat-history', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          let errorMessage = `HTTP error! status: ${response.status}`;
          try {
            // Try to parse the error response as JSON
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (jsonError) {
            // If JSON parsing fails, use the status text or the generic message
            console.warn("Could not parse error response as JSON:", jsonError);
            errorMessage = response.statusText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        setMessages(data.messages || []);
        console.log(`Fetched ${data.messages?.length || 0} history messages.`);
      } catch (err: any) {
        console.error('Failed to fetch chat history:', err);
        setError(err.message || 'Failed to load chat history.');
        setMessages([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [user, authLoading, router]);

  // Group messages by documentId
  const groupedMessages = useMemo(() => {
    return messages.reduce<GroupedMessages>((acc, msg) => {
      const key = msg.documentId || 'unknown_document'; // Group messages without documentId
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(msg);
      // Sort messages within each group by date (oldest first for display)
      acc[key].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      return acc;
    }, {});
  }, [messages]);
  
  // Sort group keys (document IDs) by the most recent message within each group
  const sortedGroupKeys = useMemo(() => {
      return Object.keys(groupedMessages).sort((docIdA, docIdB) => {
          const lastMessageA = groupedMessages[docIdA][groupedMessages[docIdA].length - 1];
          const lastMessageB = groupedMessages[docIdB][groupedMessages[docIdB].length - 1];
          return new Date(lastMessageB.createdAt || 0).getTime() - new Date(lastMessageA.createdAt || 0).getTime();
      });
  }, [groupedMessages]);

  const handleBack = () => {
    router.back();
  };

  if (authLoading || (loading && messages.length === 0)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <span>Loading chat history...</span>
      </div>
    );
  }

  if (!user) {
    return null; // Router will redirect
  }

  return (
    <div className="flex h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:px-6">
        <Button variant="ghost" size="sm" onClick={handleBack} className="mr-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-lg font-semibold">Chat History</h1>
      </header>

      <main className="flex-1 overflow-hidden p-4 md:p-6">
        {error && (
          <div className="text-center text-red-500 mb-4">
            <p>Error loading history: {error}</p>
            {/* Optionally add a retry button here */}
          </div>
        )}
        
        {!loading && messages.length === 0 && !error && (
           <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <MessageSquare className="h-16 w-16 mb-4" />
              <p className="text-xl font-medium">No chat history found.</p>
              <p>Start chatting with your documents to see history here.</p>
            </div>
        )}
        
        {messages.length > 0 && (
          <ScrollArea className="h-full pr-4">
            <div className="space-y-6">
              {sortedGroupKeys.map((docId) => (
                <Card key={docId}>
                  <CardHeader>
                    <CardTitle className="text-base truncate">Conversation (Doc ID: ...{docId.slice(-8)})</CardTitle>
                    {groupedMessages[docId][0]?.createdAt && (
                        <CardDescription>
                            Last message: {formatDistanceToNow(new Date(groupedMessages[docId][groupedMessages[docId].length - 1].createdAt || 0), { addSuffix: true })}
                        </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3 pl-4 pr-4 pb-4 text-sm">
                    {groupedMessages[docId].map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex w-full',
                          msg.role === 'user' ? 'justify-end pl-6' : 'justify-start pr-6'
                        )}
                      >
                        <div
                          className={cn(
                            'rounded-lg px-3 py-2 max-w-[85%] break-words',
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-secondary-foreground'
                          )}
                        >
                          {msg.content}
                           {msg.excelFileUrl && (
                              <a 
                                href={msg.excelFileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="block text-xs mt-1 text-blue-300 hover:text-blue-200 underline"
                              >
                                Download Excel File
                              </a>
                            )}
                          {/* Optional: Display timestamp */}
                          {/* <p className="text-xs mt-1 opacity-70">{formatDistanceToNow(new Date(msg.createdAt || 0), { addSuffix: true })}</p> */} 
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </main>
    </div>
  );
}
