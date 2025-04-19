'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getShareDetails, verifySharePassword } from '@/lib/firebase/shares';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileText, Lock, MessageSquare } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PDFViewer from '@/components/dashboard/PDFViewer';
import ChatInterface from '@/components/dashboard/ChatInterface';
import Link from 'next/link';
import { Switch } from '@/components/ui/switch';

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
}

export default function SharedDocumentPage() {
  const params = useParams();
  const shareId = params?.shareId as string;
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareDetails, setShareDetails] = useState<ShareDetails | null>(null);
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);

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
          password: details.password
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
  
  // Document viewer
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2 mr-4">
            <FileText className="h-5 w-5" />
            <h1 className="text-lg font-semibold truncate">
              {shareDetails?.documentName || 'Shared Document'}
            </h1>
          </div>
          {/* --- Chat Toggle (NEW) --- */}
          {accessGranted && shareDetails?.includeChat && (
            <div className="flex items-center space-x-2">
              <Switch 
                id="chat-toggle"
                checked={showChat}
                onCheckedChange={setShowChat}
              />
              <Label htmlFor="chat-toggle" className="text-sm font-medium whitespace-nowrap">
                Show Chat
              </Label>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
      </header>
      
      <main className="flex-1 container py-6">
        {documentUrl && (
          <div className="border rounded-lg overflow-hidden h-[calc(100vh-8rem)]">
            {shareDetails?.documentPath?.toLowerCase().endsWith('.pdf') ? (
              <ErrorBoundary fallback={
                <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                  <FileText className="h-16 w-16 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium">Unable to load PDF</h3>
                  <p className="text-sm text-gray-500 mt-2">
                    There was an error loading this document. It may be unavailable or require special permissions.
                  </p>
                </div>
              }>
                <PDFViewer fileUrl={documentUrl} />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary fallback={
                <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                  <FileText className="h-16 w-16 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium">Unable to load document</h3>
                  <p className="text-sm text-gray-500 mt-2">
                    There was an error loading this document. It may be unavailable or require special permissions.
                  </p>
                </div>
              }>
                <iframe 
                  src={documentUrl}
                  className="w-full h-full"
                  title={shareDetails?.documentName || 'Shared Document'}
                  onError={() => console.error('Error loading document iframe')}
                />
              </ErrorBoundary>
            )}
          </div>
        )}
        
        {accessGranted && shareDetails?.includeChat && showChat && shareDetails.documentId && (
          <div className="border rounded-lg mt-4"> 
            <h2 className="text-lg font-semibold p-4 border-b">Chat History</h2>
            <ChatInterface documentId={shareDetails.documentId} />
          </div>
        )}
        
        {!documentUrl && !passwordProtected && (
          <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
            <Card>
              <CardHeader>
                <CardTitle>Document Unavailable</CardTitle>
              </CardHeader>
              <CardContent>
                <p>The document content could not be loaded.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
