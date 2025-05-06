"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { getAuth } from "firebase/auth";
import { Loader2, Upload, FileText } from "lucide-react";
import { UploadCloud } from "lucide-react";

interface AttachmentUploadProps {
  journalId: number;
  onUploadComplete?: () => void;
  disabled?: boolean;
}

export function AttachmentUpload({
  journalId,
  onUploadComplete,
  disabled = false,
}: AttachmentUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    await uploadFile(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadFile = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);
      
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You must be logged in to upload attachments.",
          variant: "destructive",
        });
        return;
      }
      
      const token = await user.getIdToken();
      
      // Create form data
      const formData = new FormData();
      formData.append("file", file);
      
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.floor(Math.random() * 10);
        });
      }, 300);
      
      // Display the file details for debugging
      console.log('Attempting to upload file:', { 
        name: file.name, 
        type: file.type, 
        size: `${(file.size / 1024).toFixed(2)} KB` 
      });
      
      // Temporary fallback method - store in local storage for testing
      try {
        // Create simple form data
        const formData = new FormData();
        formData.append("file", file);
        
        console.log('Starting upload attempt with FormData');
        
        // Attempt the upload with detailed logging and error handling
        const response = await fetch(`/api/journals/${journalId}/attachments`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });
        
        clearInterval(progressInterval);
        console.log('Response status:', response.status);
        console.log('Response headers:', [...response.headers.entries()]);
        
        // Get the raw text before trying to parse as JSON
        const rawText = await response.text();
        console.log('Raw response text:', rawText);
        
        // Try to parse as JSON if possible
        let result;
        try {
          result = JSON.parse(rawText);
          console.log('Parsed response:', result);
        } catch (parseError) {
          console.error('Error parsing response as JSON:', parseError);
          // Continue with raw text
        }
        
        if (response.ok) {
          setUploadProgress(100);
          
          toast({
            title: "Upload Test Successful",
            description: `${file.name} has been processed (client-side only).`,
          });
          
          // Call the callback if provided
          if (onUploadComplete) {
            onUploadComplete();
          }
        } else {
          // Handle error based on the response we could parse or the raw text
          let errorMessage = 'Failed to upload file';
          
          if (result && result.error) {
            if (typeof result.error === 'object') {
              errorMessage = result.error.message || JSON.stringify(result.error);
            } else {
              errorMessage = result.error;
            }
          }
          
          throw new Error(`Server error (${response.status}): ${errorMessage}`);
        }
      } catch (uploadError) {
        console.error('Upload error details:', uploadError);
        throw uploadError;
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "An error occurred while uploading the file.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset progress after a short delay
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt"
      />
      
      {uploadProgress > 0 ? (
        <div className="w-full space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300 ease-in-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            onClick={triggerFileSelect}
            disabled={isUploading || disabled}
            variant="outline"
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <UploadCloud className="h-4 w-4 mr-2" />
                Add Attachment
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
