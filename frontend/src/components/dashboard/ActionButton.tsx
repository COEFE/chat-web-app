import React from 'react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { StatusButton } from "@/components/ui/status-button";
import { Plus, Upload, FolderPlus, MoreVertical } from 'lucide-react';

interface ActionButtonProps {
  onUploadClick: () => void;
  onNewFolderClick: () => void;
  disabled?: boolean;
}

export function ActionButton({ 
  onUploadClick, 
  onNewFolderClick, 
  disabled = false 
}: ActionButtonProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <StatusButton
          action="create"
          size="sm"
          disabled={disabled}
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          <span>New</span>
        </StatusButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem 
          onSelect={(e) => {
            e.preventDefault();
            onUploadClick();
          }}
          className="cursor-pointer flex items-center gap-2"
        >
          <Upload className="h-4 w-4" />
          <span>Upload Document</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onSelect={(e) => {
            e.preventDefault();
            onNewFolderClick();
          }}
          className="cursor-pointer flex items-center gap-2"
        >
          <FolderPlus className="h-4 w-4" />
          <span>Create Folder</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
