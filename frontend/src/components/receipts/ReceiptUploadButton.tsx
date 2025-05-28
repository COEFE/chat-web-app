"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Receipt, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import FileUploadButton from '@/components/FileUploadButton';
import { useFeatureFlags } from '@/lib/featureFlags';

interface ReceiptUploadButtonProps {
  className?: string;
}

type UploadState = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

function ReceiptUploadButton({ className }: ReceiptUploadButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [attachment, setAttachment] = useState<{
    name: string;
    type: string;
    base64Data: string;
    size: number;
  } | null>(null);
  const [receiptContext, setReceiptContext] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const { user } = useAuth();
  const features = useFeatureFlags();

  // Don't render if receipt scanning feature is disabled
  if (!features.receiptScanning) {
    return null;
  }

  const handleFileSelect = (fileData: {
    name: string;
    type: string;
    base64Data: string;
    size: number;
  }) => {
    setAttachment(fileData);
    setUploadState('idle');
    setErrorMessage('');
  };

  const handleClearAttachment = () => {
    setAttachment(null);
    setUploadState('idle');
    setErrorMessage('');
  };

  const processReceipt = async () => {
    if (!attachment || !user) {
      toast.error('Please select a receipt image first');
      return;
    }

    setUploadState('uploading');

    try {
      // Get the authentication token
      const token = await user.getIdToken();
      
      // Create a more detailed query with context
      const query = receiptContext.trim() 
        ? `Process this receipt for: ${receiptContext.trim()}` 
        : 'process receipt';
      
      // Prepare request data similar to AgentChatInterface
      const requestData = {
        query,
        conversationId: `receipt-upload-${user.uid}-${Date.now()}`,
        messages: [],
        attachments: [attachment]
      };

      setUploadState('processing');

      // Send the request to the agent-chat API
      const response = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      setUploadState('success');
      toast.success('Receipt processed successfully!');
      
      // Reset after a delay
      setTimeout(() => {
        setIsOpen(false);
        setAttachment(null);
        setReceiptContext('');
        setUploadState('idle');
      }, 2000);

    } catch (error) {
      console.error('Receipt processing error:', error);
      setUploadState('error');
      const errorMsg = error instanceof Error ? error.message : 'Failed to process receipt';
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
    }
  };

  const getStateIcon = () => {
    switch (uploadState) {
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-5 w-5 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Upload className="h-5 w-5" />;
    }
  };

  const getStateText = () => {
    switch (uploadState) {
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'Processing receipt...';
      case 'success':
        return 'Success!';
      case 'error':
        return 'Error occurred';
      default:
        return 'Process Receipt';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Receipt className="h-4 w-4 mr-2" />
          Upload Receipt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Receipt</DialogTitle>
          <DialogDescription>
            Upload a receipt image and provide context to help the AI categorize it accurately.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Receipt Context Input */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="receipt-context">What is this receipt for? (Optional)</Label>
                  <Textarea
                    id="receipt-context"
                    placeholder="e.g., Client dinner, Office supplies, Conference travel, Team lunch..."
                    value={receiptContext}
                    onChange={(e) => setReceiptContext(e.target.value)}
                    disabled={uploadState === 'uploading' || uploadState === 'processing'}
                    className="min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Providing context helps the AI choose better categories and descriptions.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* File Upload */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <FileUploadButton
                  onFileSelect={handleFileSelect}
                  onClear={handleClearAttachment}
                  selectedFile={attachment ? { name: attachment.name, size: attachment.size } : null}
                  disabled={uploadState === 'uploading' || uploadState === 'processing'}
                />
                
                {attachment && (
                  <div className="text-sm text-muted-foreground">
                    Selected: {attachment.name} ({(attachment.size / (1024 * 1024)).toFixed(1)} MB)
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {errorMessage && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {errorMessage}
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button 
              variant="outline" 
              onClick={() => setIsOpen(false)}
              disabled={uploadState === 'uploading' || uploadState === 'processing'}
            >
              Cancel
            </Button>
            <Button 
              onClick={processReceipt}
              disabled={!attachment || uploadState === 'uploading' || uploadState === 'processing'}
              className="min-w-[140px]"
            >
              {getStateIcon()}
              <span className="ml-2">{getStateText()}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ReceiptUploadButton;
