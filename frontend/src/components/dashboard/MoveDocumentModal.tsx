'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FolderData } from '@/types'; // Assuming FolderData is defined in types

interface MoveDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  folders: FolderData[];
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

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => {
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
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
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
                  {folders.map((folder) => (
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
      </DialogContent>
    </Dialog>
  );
}
