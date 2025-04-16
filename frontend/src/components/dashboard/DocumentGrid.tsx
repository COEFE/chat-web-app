'use client';

import React from 'react';
import { Folder, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilesystemItem } from '@/types';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Trash2, Move, Pencil } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';

interface DocumentGridProps {
  items: FilesystemItem[];
  isLoading: boolean;
  error: string | null;
  onSelectItem: (item: FilesystemItem | null) => void; // For selecting a document/folder
  onFolderClick: (folderId: string, folderName: string) => void; // For navigating into a folder
  onDeleteDocument: (docId: string) => Promise<void>;
  onDeleteFolder: (folderId: string, folderName: string) => void;
  onMoveClick: (itemId: string, itemName: string, itemType: 'document' | 'folder') => void;
  onRenameFolder: (folderId: string, currentName: string) => void;
  // We might need rename for documents too later
}

const DocumentGrid: React.FC<DocumentGridProps> = ({
  items,
  isLoading,
  error,
  onSelectItem,
  onFolderClick,
  onDeleteDocument,
  onDeleteFolder,
  onMoveClick,
  onRenameFolder,
}) => {

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4">
        {Array.from({ length: 12 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton width={24} height={24} />
              <Skeleton width={20} height={20} />
            </CardHeader>
            <CardContent>
              <Skeleton height={20} />
              <Skeleton height={14} width="80%" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 p-4">Error loading items: {error}</div>;
  }

  if (items.length === 0) {
    return <div className="text-center text-gray-500 p-4">No items in this folder.</div>;
  }

  const handleCardClick = (item: FilesystemItem, e: React.MouseEvent) => {
    // Prevent triggering click when interacting with dropdown menu
    if ((e.target as HTMLElement).closest('[data-radix-dropdown-menu-trigger]')) {
      return;
    }
    
    if (item.type === 'folder') {
      onFolderClick(item.id, item.name);
    } else {
      onSelectItem(item); // Select document for viewing
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4 flex-grow overflow-y-auto">
      {items.map((item) => (
        <Card 
          key={item.id} 
          className="hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between h-full" 
          onClick={(e) => handleCardClick(item, e)}
        >
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 pt-4 px-4">
            {item.type === 'folder' ? (
              <Folder className="h-6 w-6 text-blue-500" />
            ) : (
              <FileText className="h-6 w-6 text-gray-500" />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {item.type === 'folder' && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRenameFolder(item.id, item.name); }}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMoveClick(item.id, item.name, item.type); }}>
                  <Move className="mr-2 h-4 w-4" />
                  Move
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-red-600 focus:text-red-600 focus:bg-red-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.type === 'document') {
                      onDeleteDocument(item.id);
                    } else {
                      onDeleteFolder(item.id, item.name);
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <p className="text-sm font-medium leading-none truncate" title={item.name}>
              {item.name}
            </p>
            {/* Optional: Add date or other info here */}
            {/* <p className="text-xs text-muted-foreground">{...}</p> */}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default DocumentGrid;
