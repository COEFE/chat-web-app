'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
// Import only what we need from dialog components
import { DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MyDocumentData } from '@/types/documents'; // Import the correct type

interface MoveDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  folders: MyDocumentData[]; // Update prop type
  onConfirmMove: (targetFolderId: string | null) => void;
  isLoadingFolders?: boolean; // Optional loading state for folders
}

const ROOT_FOLDER_VALUE = '__ROOT__'; // Special value for moving to root

export function MoveDocumentModal({ 
  isOpen, 
  onClose, 
  documentName, 
  folders, 
  onConfirmMove, 
  isLoadingFolders 
}: MoveDocumentModalProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Reset selection when modal opens or folders change
  useEffect(() => {
    if (isOpen) {
      setSelectedFolderId(null); // Default to no selection
      setIsMoving(false);
    }
  }, [isOpen, folders]);
  
  // Handle focus management when the modal closes
  useEffect(() => {
    if (!isOpen) {
      // Reset any focus-related state when modal is closed
      setSelectedFolderId(null);
      setIsMoving(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    setIsMoving(true);
    try {
      const targetId = selectedFolderId === ROOT_FOLDER_VALUE ? null : selectedFolderId;
      
      // First, ensure we're not going to have focus issues
      // by moving focus to a safe element before closing
      if (cancelButtonRef.current) {
        cancelButtonRef.current.focus();
      }
      
      // Small delay before closing to ensure focus is properly managed
      setTimeout(() => {
        onClose(); // Close modal
      }, 0);
      
      await onConfirmMove(targetId);
    } catch (error) { 
      // Error handling is likely done in the parent's onConfirmMove, 
      // but you could add specific modal feedback here if needed.
      console.error("Move failed:", error); 
    } finally {
      setIsMoving(false);
    }
  };

  // Custom handler for dialog close
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      // When closing, ensure we handle focus properly
      if (cancelButtonRef.current) {
        cancelButtonRef.current.focus();
      }
      // Small delay before actually closing
      setTimeout(() => {
        onClose();
      }, 0);
    }
  }, [onClose]);

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
      <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:max-w-[425px]" data-inert={!isOpen ? true : undefined}>
        <DialogHeader>
          <DialogTitle>Move Document</DialogTitle>
          <DialogDescription>
            Select a destination folder for "{documentName}".
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="folder-select" className="text-right">
              Destination
            </Label>
            {isLoadingFolders ? (
              <div className="col-span-3 text-sm text-muted-foreground">Loading folders...</div>
            ) : (
              <Select 
                value={selectedFolderId ?? ''} 
                onValueChange={setSelectedFolderId}
              >
                <SelectTrigger id="folder-select" className="col-span-3">
                  <SelectValue placeholder="Select a folder..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_FOLDER_VALUE}>(Move to Root)</SelectItem>
                  {folders
                   .filter(folder => folder.isFolder) // Ensure we only list folders
                   .map((folder) => (
                     <SelectItem key={folder.id} value={folder.id}>
                       {folder.name}
                     </SelectItem>
                   ))}
                  {folders.length === 0 && (
                     <div className="px-2 py-1.5 text-sm text-muted-foreground">No folders available.</div>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button 
            ref={cancelButtonRef}
            variant="outline" 
            onClick={onClose} 
            disabled={isMoving}
          >
            Cancel
          </Button>
          <Button 
            type="button" // Use type="button" to prevent form submission if wrapped
            onClick={handleConfirm} 
            disabled={!selectedFolderId || isMoving} // Disable if no folder selected or currently moving
          >
            {isMoving ? 'Moving...' : 'Confirm Move'}
          </Button>
        </DialogFooter>
      </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
