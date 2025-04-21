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
import { createShareLink } from "@/lib/firebase/shares";
import { sendShareInvite } from "@/lib/firebase/email";
import { ShareOptions, CreateShareInput } from "@/types/share"; // Path relative to src
import { Copy, Loader2, Share2, Mail } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface ShareDialogProps {
  documentId: string;
  documentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ documentId, documentName, open, onOpenChange }: ShareDialogProps) {
  const [includeChat, setIncludeChat] = useState(false);
  const [isChatActive, setIsChatActive] = useState(false); // New state for interactive chat
  const [accessType, setAccessType] = useState<"view" | "comment">("view");
  const [expirationDays, setExpirationDays] = useState<number | null>(7); // Default 7 days
  const [password, setPassword] = useState<string>("");
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailAddress, setEmailAddress] = useState<string>("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setShareLink(null);
      setPassword("");
      setIncludeChat(false);
      setIsChatActive(false);
      setExpirationDays(7);
      setEmailAddress("");
      setSendingEmail(false);
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

    const options: CreateShareInput = {
      documentId,
      includeChat,
      isChatActive: includeChat ? isChatActive : false, // Pass new state (only if includeChat is true)
      accessType,
      expirationDays,
      password: password || undefined, // Send undefined if empty
    };

    try {
      // Assuming createShareLink returns an object like { id: 'shareId' }
      const result = await createShareLink(options);
      const generatedLink = `${window.location.origin}/shared/${result.id}`;
      console.log("Generated share link:", generatedLink); // Debug log
      setShareLink(generatedLink);
      
      // Clear email field when creating a new link
      setEmailAddress("");
      setSendingEmail(false);
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

  const handleSendEmail = async () => {
    if (!shareLink || !emailAddress || !validateEmail(emailAddress)) {
      setError("Please enter a valid email address");
      return;
    }

    setSendingEmail(true);
    setError(null);

    try {
      // Extract the share ID from the share link
      const shareId = shareLink.includes("/shared/") 
        ? shareLink.split("/shared/")[1] 
        : shareLink.split("/share/")[1];
      
      // Send the invitation using our new email service
      await sendShareInvite(
        shareId,
        emailAddress,
        documentName
      );

      toast({
        title: "Invitation Sent!",
        description: `The document has been shared with ${emailAddress}`,
      });
      
      setEmailAddress(""); // Clear the email field after successful send
    } catch (err: any) {
      console.error("Error sending invitation:", err);
      setError(err.message || "Failed to send invitation.");
    } finally {
      setSendingEmail(false);
    }
  };

  const validateEmail = (email: string): boolean => {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(email);
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
      <DialogContent className="sm:max-w-[525px] [&>button[data-slot=dialog-close]]:hidden" ref={dialogContentRef}>
        <DialogHeader>
          <DialogTitle>Share Document: {documentName || "Document"}</DialogTitle>
          <DialogDescription>
            Configure settings and generate a shareable link.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Include Chat Toggle */}
          <div className="flex items-center justify-between gap-4">            
            <Switch
              id="include-chat"
              checked={includeChat}
              onCheckedChange={(checked) => {
                setIncludeChat(checked);
                if (!checked) {
                  setIsChatActive(false); // Reset active chat if include chat is turned off
                }
              }}
            />
            <Label htmlFor="include-chat" className="flex-grow"> 
              Include Chat
            </Label>
          </div>

          {/* Conditional Toggle for Active Chat */}
          {includeChat && (
            <div className="flex items-center justify-between gap-4"> 
              <Switch
                id="enable-chat-interaction"
                checked={isChatActive}
                onCheckedChange={setIsChatActive}
              />
              <Label htmlFor="enable-chat-interaction" className="flex-grow whitespace-nowrap"> 
                Enable Chat Interaction
              </Label>
            </div>
          )}

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
            <div className="space-y-4 mt-4 p-4 border rounded-md bg-muted/50">
              <div>
                <Label htmlFor="share-link">Shareable Link</Label>
                <div className="flex items-center space-x-2">
                  <Input id="share-link" value={shareLink} readOnly />
                  <Button type="button" size="sm" onClick={handleCopyToClipboard}>
                    <span className="sr-only">Copy</span>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Email Sharing Section */}
              <div className="pt-2 border-t border-border">
                <Label htmlFor="email-invite" className="block mb-1 font-medium">Send Invitation by Email</Label>
                <div className="flex items-center space-x-2 mt-1">
                  <Input 
                    id="email-invite" 
                    type="email" 
                    placeholder="recipient@example.com"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    className="flex-grow"
                  />
                  <Button 
                    type="button" 
                    size="sm"
                    variant="secondary"
                    onClick={handleSendEmail}
                    disabled={sendingEmail || !emailAddress}
                    className="shrink-0 px-3"
                  >
                    {sendingEmail ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-1" />
                        <span>Send</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {!shareLink && (
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
