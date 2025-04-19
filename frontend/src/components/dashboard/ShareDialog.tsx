"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch"; // Ensure this path is correct for Shadcn switch
import { useState, useEffect, useRef } from "react";
import { createShareLink } from "@/lib/firebase/shares"; // Path relative to src
import { ShareOptions } from "@/types/share"; // Path relative to src
import { Copy, Loader2, Share2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface ShareDialogProps {
  documentId: string;
  documentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ documentId, documentName, open, onOpenChange }: ShareDialogProps) {
  const [includeChat, setIncludeChat] = useState(false);
  const [accessType, setAccessType] = useState<"view" | "comment">("view");
  const [expirationDays, setExpirationDays] = useState<number | null>(7); // Default 7 days
  const [password, setPassword] = useState<string>("");
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setShareLink(null);
      setPassword("");
      setIncludeChat(false);
      setExpirationDays(7);
    }
  }, [open, documentId]);

  // Handle safe dialog closing
  const handleDialogClose = () => {
    // First set focus to a safe element (document body)
    document.body.focus();
    // Then close the dialog
    onOpenChange(false);
  };

  const handleCreateLink = async () => {
    setLoading(true);
    setError(null);
    setShareLink(null);

    const options: ShareOptions = {
      documentId,
      includeChat,
      accessType,
      expirationDays,
      password: password || undefined, // Send undefined if empty
    };

    try {
      // Assuming createShareLink returns an object like { id: 'shareId' }
      const result = await createShareLink(options);
      const generatedLink = `${window.location.origin}/shared/${result.id}`;
      setShareLink(generatedLink);
    } catch (err: any) {
      console.error("Error creating share link:", err);
      setError(err.message || "Failed to create share link.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      toast({
        title: "Link Copied!",
        description: "Share link copied to clipboard.",
      });
    }
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(newOpen) => {
        if (!newOpen) {
          handleDialogClose();
        } else {
          onOpenChange(true);
        }
      }}
    >
      <DialogContent className="sm:max-w-[480px]" ref={dialogContentRef}>
        <DialogHeader>
          <DialogTitle>Share "{documentName}"</DialogTitle>
          <DialogDescription>
            Configure the settings and generate a shareable link.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {/* Share Options Form */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="include-chat" className="text-right col-span-1">
              Include Chat
            </Label>
            <Switch
              id="include-chat"
              checked={includeChat}
              onCheckedChange={setIncludeChat}
              className="col-span-3"
            />
          </div>
          {/* Add Access Type Select here later if needed */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="expiration" className="text-right col-span-1">
              Expires in (days)
            </Label>
            <Input
              id="expiration"
              type="number"
              min="1"
              value={expirationDays ?? ""}
              onChange={(e) => setExpirationDays(e.target.value ? parseInt(e.target.value) : null)}
              placeholder="Never (leave blank)"
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="password" className="text-right col-span-1">
              Password (optional)
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Protect with a password"
              className="col-span-3"
            />
          </div>

          {/* Generated Link Section */}
          {shareLink && (
            <div className="space-y-2 mt-4 p-4 border rounded-md bg-muted/50">
              <Label htmlFor="share-link">Shareable Link</Label>
              <div className="flex items-center space-x-2">
                <Input id="share-link" value={shareLink} readOnly />
                <Button type="button" size="sm" onClick={handleCopyToClipboard}>
                  <span className="sr-only">Copy</span>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {shareLink ? (
            <Button type="button" onClick={handleDialogClose}>Close</Button>
          ) : (
            <Button type="button" onClick={handleCreateLink} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? "Generating..." : "Generate Link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
