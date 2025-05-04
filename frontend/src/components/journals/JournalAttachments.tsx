"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Paperclip, X, FileIcon, Download } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getAuth } from "firebase/auth";

export interface JournalAttachment {
  id: number;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  uploaded_at: string | Date;
}

interface JournalAttachmentsProps {
  journalId: number;
  attachments: JournalAttachment[];
  readOnly?: boolean;
  onAttachmentAdded?: () => void;
  onAttachmentRemoved?: () => void;
}

export function JournalAttachments({
  journalId,
  attachments,
  readOnly = false,
  onAttachmentAdded,
  onAttachmentRemoved,
}: JournalAttachmentsProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const { toast } = useToast();

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    setIsUploading(true);
    
    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to upload attachments");
      }
      
      const token = await user.getIdToken();
      
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch(`/api/journals/${journalId}/attachments`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to upload attachment");
      }
      
      toast({
        title: "Attachment Uploaded",
        description: `${file.name} has been attached to this journal entry.`,
        variant: "default",
      });
      
      if (onAttachmentAdded) {
        onAttachmentAdded();
      }
    } catch (err: any) {
      console.error("Error uploading attachment:", err);
      toast({
        title: "Upload Failed",
        description: err.message || "An error occurred while uploading the attachment",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Clear the input value to allow uploading the same file again
      e.target.value = "";
    }
  };

  // Handle attachment deletion
  const handleDeleteAttachment = async (attachmentId: number) => {
    setIsDeleting(attachmentId);
    
    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to delete attachments");
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch(`/api/journals/${journalId}/attachments/${attachmentId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete attachment");
      }
      
      toast({
        title: "Attachment Deleted",
        description: "The attachment has been removed from this journal entry.",
        variant: "default",
      });
      
      if (onAttachmentRemoved) {
        onAttachmentRemoved();
      }
    } catch (err: any) {
      console.error("Error deleting attachment:", err);
      toast({
        title: "Deletion Failed",
        description: err.message || "An error occurred while deleting the attachment",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(null);
    }
  };

  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Attachments</h3>
        
        {!readOnly && (
          <div className="flex items-center">
            <Input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
            <label htmlFor="file-upload">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                asChild
                disabled={isUploading}
              >
                <span>
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...
                    </>
                  ) : (
                    <>
                      <Paperclip className="mr-2 h-4 w-4" /> Attach File
                    </>
                  )}
                </span>
              </Button>
            </label>
          </div>
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attachments</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between rounded-md border p-2"
            >
              <div className="flex items-center space-x-2">
                <FileIcon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{attachment.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.file_size)}
                  </p>
                </div>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  asChild
                >
                  <a href={attachment.file_url} target="_blank" rel="noopener noreferrer" download>
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download</span>
                  </a>
                </Button>
                
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive"
                    onClick={() => handleDeleteAttachment(attachment.id)}
                    disabled={isDeleting === attachment.id}
                  >
                    {isDeleting === attachment.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    <span className="sr-only">Delete</span>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
