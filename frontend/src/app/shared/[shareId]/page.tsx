'use client';

import { useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import { getShareDetails, verifySharePassword } from '@/lib/firebase/shares';
import DocumentViewer from '@/components/document/DocumentViewer';
import PasswordProtection from '@/components/shared/PasswordProtection';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileText, Lock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PDFViewer from '@/components/dashboard/PDFViewer';

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

export default async function SharedDocumentPage({ params }: { params: { shareId: string } }) {
  try {
    const { shareId } = params;
    console.log(`[SharedDocumentPage] Fetching share details for: ${shareId}`);
    
    const shareDetails = await getShareDetails(shareId);
    
    if (!shareDetails) {
      console.log(`[SharedDocumentPage] Share not found: ${shareId}`);
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8 max-w-md w-full text-center">
            <h1 className="text-2xl font-bold mb-4">Share Not Found</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              The shared document you're looking for doesn't exist or has expired.
            </p>
            <Link href="/">
              <Button>Return to Home</Button>
            </Link>
          </div>
        </div>
      );
    }

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [passwordProtected, setPasswordProtected] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [verifyingPassword, setVerifyingPassword] = useState(false);
    const [accessGranted, setAccessGranted] = useState(false);
    const [documentUrl, setDocumentUrl] = useState<string | null>(null);

    // Fetch share details
    useEffect(() => {
      async function fetchShareDetails() {
        if (!shareId) return;
        
        try {
          setLoading(true);
          const details = await getShareDetails(shareId);
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
        } catch (error) {
          console.error('[SharedDocumentPage] Error fetching shared document:', error);
          
          // Return a user-friendly error page instead of notFound()
          return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4">
              <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8 max-w-md w-full text-center">
                <h1 className="text-2xl font-bold mb-4">Something Went Wrong</h1>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  We encountered an error while trying to load this shared document. Please try again later.
                </p>
                <div className="text-left bg-gray-100 dark:bg-gray-700 p-4 rounded mb-6 overflow-auto max-h-40">
                  <code className="text-xs">{error instanceof Error ? error.message : 'Unknown error'}</code>
                </div>
                <Link href="/">
                  <Button>Return to Home</Button>
                </Link>
              </div>
            </div>
          );
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
          useToast({
            title: 'Access granted',
            description: 'Password verified successfully',
          });
        } else {
          useToast({
            title: 'Access denied',
            description: 'Incorrect password',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('[SharedDocumentPage] Error verifying password:', error);
        useToast({
          title: 'Verification failed',
          description: error.message || 'Failed to verify password',
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
  
  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center">{error}</p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button variant="outline" onClick={() => window.location.href = '/'}>
              Return to Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  // Password verification screen
  if (passwordProtected && !accessGranted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Password Protected Document
            </CardTitle>
            <CardDescription>
              This document requires a password to access
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyPassword()}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full" 
              onClick={handleVerifyPassword}
              disabled={verifyingPassword || !passwordInput}
            >
              {verifyingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify Password
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  // Document viewer
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <h1 className="text-lg font-semibold">
              {shareDetails?.documentName || 'Shared Document'}
            </h1>
          </div>
        </div>
      </header>
      
      <main className="flex-1 container py-6">
        {documentUrl && (
          <div className="border rounded-lg overflow-hidden h-[calc(100vh-8rem)]">
            {shareDetails?.documentPath?.toLowerCase().endsWith('.pdf') ? (
              <PDFViewer fileUrl={documentUrl} />
            ) : (
              <iframe 
                src={documentUrl}
                className="w-full h-full"
                title={shareDetails?.documentName || 'Shared Document'}
              />
            )}
          </div>
        )}
        
        {!documentUrl && (
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
