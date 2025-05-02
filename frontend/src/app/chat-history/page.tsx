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
import { getFirestore, collection, query, orderBy, getDocs, limit } from 'firebase/firestore';

// Define a type for chat session entries
interface ChatSession {
  id: string;
  title: string;
  createdAt: string | null;
  preview: string;
}

export default function ChatHistoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    const fetchSessions = async () => {
      setLoading(true);
      setError(null);
      try {
        const db = getFirestore();
        const chatsRef = collection(db, 'users', user.uid, 'chats');
        const q = query(chatsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const fetched = await Promise.all(snapshot.docs.map(async docSnap => {
          const data = docSnap.data() as any;
          const ts = data.createdAt?.toDate();
          // Fetch last message preview
          const msgsRef = collection(db, 'users', user.uid, 'chats', docSnap.id, 'messages');
          const msgsQuery = query(msgsRef, orderBy('createdAt', 'desc'), limit(1));
          const msgsSnap = await getDocs(msgsQuery);
          const lastMsg = msgsSnap.docs[0]?.data()?.content || '';
          return {
            id: docSnap.id,
            title: data.title || 'Untitled Chat',
            createdAt: ts?.toISOString() || null,
            preview: lastMsg,
          };
        }));
        setSessions(fetched);
      } catch (err: any) {
        console.error('Failed to fetch chat sessions:', err);
        setError(err.message || 'Failed to load chat sessions.');
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, [user, authLoading, router]);

  const handleBack = () => router.back();
  const handleSessionClick = (sessionId: string) => router.push(`/chat/${sessionId}`);

  if (authLoading || (loading && sessions.length === 0)) {
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
        
        {!loading && sessions.length === 0 && !error && (
           <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <MessageSquare className="h-16 w-16 mb-4" />
              <p className="text-xl font-medium">No chat sessions found.</p>
              <p>Start chatting to see sessions here.</p>
            </div>
        )}
        
        {sessions.length > 0 && (
          <ScrollArea className="h-full pr-4">
            <div className="space-y-6">
              {sessions.map(session => (
                <Card
                  key={session.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleSessionClick(session.id)}
                >
                  <CardHeader className="flex items-center justify-between p-4">
                    <div>
                      <CardTitle className="text-base truncate">{session.title}</CardTitle>
                      {session.createdAt && (
                        <CardDescription>
                          {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                        </CardDescription>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation();
                        handleSessionClick(session.id);
                      }}
                    >
                      View Chat
                    </Button>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0 text-sm text-muted-foreground">
                    {session.preview
                      ? (session.preview.length > 80
                          ? session.preview.slice(0, 80) + '…'
                          : session.preview)
                      : 'No messages yet'}
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
