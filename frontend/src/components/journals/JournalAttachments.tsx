"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Paperclip, FileIcon, Download, Eye, Trash2 } from "lucide-react";
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
      <div className="flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Attachments</h3>
          <p className="text-muted-foreground text-sm">Supporting documents for this transaction.</p>
        </div>
        
        {!readOnly && (
          <div className="flex items-center mt-2">
            <Input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading}
              accept="image/*,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
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
                      <Paperclip className="mr-2 h-4 w-4" /> Add Attachment
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
              className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <FileIcon className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{attachment.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.file_size)}
                  </p>
                </div>
              </div>
              <div className="flex space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                  asChild
                >
                  <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </a>
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 bg-red-50 text-destructive hover:text-white hover:bg-destructive"
                  onClick={() => handleDeleteAttachment(attachment.id)}
                  disabled={isDeleting === attachment.id || readOnly}
                >
                  {isDeleting === attachment.id ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1" />
                  )}
                  Delete
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  asChild
                  title="Download"
                >
                  <a href={attachment.file_url} target="_blank" rel="noopener noreferrer" download>
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download</span>
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
