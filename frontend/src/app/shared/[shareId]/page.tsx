'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getShareDetails, verifySharePassword } from '@/lib/firebase/shares';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, FileText, Lock, MessageSquare, X, Maximize2, Minimize2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PDFViewer from '@/components/dashboard/PDFViewer';
import ChatInterface from '@/components/dashboard/ChatInterface';
import Link from 'next/link';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import useMediaQuery from '@/hooks/useMediaQuery';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Error boundary component for handling rendering errors
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error in component:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

// This interface should match the response from our API
interface ShareDetails {
  documentId: string;
  documentName: string;
  documentPath: string;
  expiresAt: number | null;
  includeChat: boolean;
  accessType: 'view' | 'comment';
  password: boolean | null;
  isChatActive: boolean;
}

export default function SharedDocumentPage() {
  const params = useParams();
  const shareId = params?.shareId as string;
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [shareDetails, setShareDetails] = useState<ShareDetails | null>(null);
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);

  const isMobile = useMediaQuery('(max-width: 768px)');

  // Fetch share details
  useEffect(() => {
    async function fetchShareDetails() {
      if (!shareId) return;
      
      try {
        setLoading(true);
        const details = await getShareDetails(shareId);
        
        if (!details) {
          setError('Share not found or has expired');
          return;
        }
        
        // Convert the API response to our ShareDetails type
        const shareDetails: ShareDetails = {
          documentId: details.documentId,
          documentName: details.documentName,
          documentPath: details.documentPath,
          expiresAt: details.expiresAt,
          includeChat: details.includeChat,
          accessType: details.accessType as 'view' | 'comment',
          password: details.password,
          isChatActive: details.isChatActive
        };
        setShareDetails(shareDetails);
        
        // Check if password protected
        if (shareDetails.password) {
          setPasswordProtected(true);
        } else {
          setAccessGranted(true);
          // Generate document URL for viewing
          const proxyUrl = `/api/file-proxy?path=${encodeURIComponent(shareDetails.documentPath)}`;
          setDocumentUrl(proxyUrl);
        }
      } catch (err: any) {
        console.error('Error fetching share details:', err);
        setError(err.message || 'Failed to load shared document');
      } finally {
        setLoading(false);
      }
    }
    
    fetchShareDetails();
  }, [shareId]);

  // Handle password verification
  const handleVerifyPassword = async () => {
    if (!shareId || !passwordInput) return;
    
    try {
      setVerifyingPassword(true);
      const result = await verifySharePassword(shareId, passwordInput);
      
      if (result.accessGranted) {
        setAccessGranted(true);
        // Generate document URL for viewing
        if (shareDetails?.documentPath) {
          const proxyUrl = `/api/file-proxy?path=${encodeURIComponent(shareDetails.documentPath)}`;
          setDocumentUrl(proxyUrl);
        }
        toast({
          title: 'Access granted',
          description: 'Password verified successfully',
        });
      } else {
        toast({
          title: 'Access denied',
          description: 'Incorrect password',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      console.error('Error verifying password:', err);
      toast({
        title: 'Verification failed',
        description: err.message || 'Failed to verify password',
        variant: 'destructive',
      });
    } finally {
      setVerifyingPassword(false);
    }
  };
  
  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Loading Shared Document</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center p-6">
            <Loader2 className="h-8 w-8 animate-spin" />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Password protected state
  if (passwordProtected && !accessGranted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Password Protected Document</CardTitle>
            <CardDescription className="text-center">
              This document is password protected. Please enter the password to view it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center mb-4">
              <Lock className="h-12 w-12 text-gray-400" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="Enter password" 
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyPassword()}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Link href="/">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button 
              onClick={handleVerifyPassword} 
              disabled={!passwordInput || verifyingPassword}
            >
              {verifyingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying
                </>
              ) : (
                'Access Document'
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <h1 className="text-lg font-semibold">
              {shareDetails?.documentName || 'Shared Document'}
            </h1>
          </div>
          
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Maximize/Minimize Button */}
            {(!isMobile || !chatOpen) && shareDetails?.includeChat && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsMaximized(prev => !prev)}
                title={isMaximized ? "Exit full screen" : "Full screen"}
              >
                {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            )}
            
            {/* Chat Toggle Button (Mobile Only) */}
            {isMobile && shareDetails?.includeChat && shareDetails?.documentId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setChatOpen(prev => !prev)}
                title={chatOpen ? "Hide Chat" : "Show Chat"}
                className="md:hidden"
              >
                {chatOpen ? <X className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </header>
      
      <main className="flex-1 flex flex-col overflow-hidden"> 
        {error && (
          <div className="flex items-center justify-center flex-1">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Error Loading Document</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{error}</p>
              </CardContent>
            </Card>
          </div>
        )}
        
        {accessGranted && !error && (
          !isMobile && shareDetails?.includeChat && !isMaximized ? (
            // Split View: Document + Chat
            <ResizablePanelGroup 
              direction="horizontal"
              className="flex-1 overflow-hidden h-full w-full" 
            >
              <ResizablePanel defaultSize={60} minSize={30}> 
                <div className="flex h-full w-full overflow-hidden"> 
                  {documentUrl ? (
                    shareDetails?.documentPath?.toLowerCase().endsWith('.pdf') ? (
                      <ErrorBoundary fallback={<div>Error loading PDF.</div>}> 
                        <PDFViewer fileUrl={documentUrl} />
                      </ErrorBoundary>
                    ) : (
                      <ErrorBoundary fallback={<div>Error loading document.</div>}> 
                        <iframe 
                          src={documentUrl}
                          className="w-full h-full"
                          title={shareDetails?.documentName || 'Shared Document'}
                          onError={() => console.error('Error loading document iframe')}
                        />
                      </ErrorBoundary>
                    )
                  ) : (
                    <div className="flex items-center justify-center h-full"> 
                      <Card>
                        <CardHeader><CardTitle>Document Unavailable</CardTitle></CardHeader>
                        <CardContent><p>Content could not be loaded.</p></CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={40} minSize={25}> 
                <div className="flex h-full flex-col"> 
                  {shareDetails.documentId && (
                    <ChatInterface 
                      documentId={shareDetails.documentId} 
                      isReadOnly={!shareDetails.isChatActive}
                    />
                  )}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            // Document Only View or Maximized View
            <div className="flex-1 overflow-hidden relative h-full w-full"> 
              {documentUrl ? (
                shareDetails?.documentPath?.toLowerCase().endsWith('.pdf') ? (
                  <ErrorBoundary fallback={<div>Error loading PDF.</div>}> 
                    <PDFViewer fileUrl={documentUrl} />
                  </ErrorBoundary>
                ) : (
                  <ErrorBoundary fallback={<div>Error loading document.</div>}> 
                    <iframe 
                      src={documentUrl}
                      className="w-full h-full"
                      title={shareDetails?.documentName || 'Shared Document'}
                      onError={() => console.error('Error loading document iframe')}
                    />
                  </ErrorBoundary>
                )
              ) : (
                <div className="flex items-center justify-center h-full"> 
                  <Card>
                    <CardHeader><CardTitle>Document Unavailable</CardTitle></CardHeader>
                    <CardContent><p>Content could not be loaded.</p></CardContent>
                  </Card>
                </div>
              )}
              {isMobile && shareDetails?.includeChat && shareDetails.documentId && chatOpen && !isMaximized && (
                <div className="absolute inset-0 z-40 bg-background flex flex-col">
                  <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    <ChatInterface 
                      documentId={shareDetails.documentId} 
                      isReadOnly={!shareDetails.isChatActive}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </main>
    </div>
  );
}
