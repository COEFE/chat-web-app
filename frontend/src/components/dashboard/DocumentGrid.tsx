'use client';

import React from 'react';
import { Folder, FileText, Loader2, Star, MoreHorizontal, Pencil, Move, Trash2, Share2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilesystemItem } from '@/types';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
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
  favoriteIds: Set<string>;
  handleToggleFavorite: (itemId: string, currentStatus: boolean) => Promise<void>;
  togglingFavoriteId: string | null;
  onOpenShareDialog: (doc: { id: string; name: string }) => void; // Add prop for opening dialog
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
  favoriteIds,
  handleToggleFavorite,
  togglingFavoriteId,
  onOpenShareDialog, // Destructure the new prop
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
            {/* Use theme colors for icons */}
            {item.type === 'folder' ? (
              <Folder className="h-6 w-6 text-[var(--primary)]" />
            ) : (
              <FileText className="h-6 w-6 text-[var(--muted-foreground)]" />
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
                  /* Apply specific dark mode colors */
                  className="text-red-600 focus:text-red-600 focus:bg-red-100 dark:text-red-400 dark:focus:bg-red-900/50 dark:focus:text-red-400"
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
                <DropdownMenuItem 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    handleToggleFavorite(item.id, favoriteIds.has(item.id)); 
                  }}
                  disabled={togglingFavoriteId === item.id}
                >
                  <Star className={`mr-2 h-4 w-4 ${favoriteIds.has(item.id) ? 'fill-current text-yellow-400' : ''}`} /> 
                  {togglingFavoriteId === item.id 
                    ? 'Updating...' 
                    : favoriteIds.has(item.id) 
                      ? 'Remove from Favorites' 
                      : 'Add to Favorites'}
                </DropdownMenuItem>
                {item.type === 'document' && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent click from bubbling to the grid item
                      // Delay opening the dialog to avoid focus conflicts
                      setTimeout(() => {
                        onOpenShareDialog({ id: item.id, name: item.name }); // Call the prop handler
                      }, 100); // 100ms delay
                    }}
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    <span>Share</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 h-7 w-7 text-muted-foreground hover:text-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
              onClick={(e) => {
                e.stopPropagation(); // Prevent card click
                handleToggleFavorite(item.id, favoriteIds.has(item.id));
              }}
              disabled={togglingFavoriteId === item.id}
              aria-label={favoriteIds.has(item.id) ? "Remove from Favorites" : "Add to Favorites"}
            >
              <Star 
                className={`h-4 w-4 ${favoriteIds.has(item.id) && "fill-yellow-400 text-yellow-500"} ${togglingFavoriteId === item.id && "animate-pulse"}`}
              />
            </Button>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <p className="text-sm font-medium leading-none truncate" title={item.name}>
              {item.name}
            </p>
            {(item.createdAt || item.updatedAt) && (
              <p className="text-xs text-muted-foreground mt-1">
                {(() => { // IIFE for cleaner logic
                  const dateValue = item.createdAt || item.updatedAt;
                  let date: Date | null = null;
                  if (dateValue instanceof Timestamp) {
                    date = dateValue.toDate();
                  } else if (typeof dateValue === 'string') {
                    try { date = new Date(dateValue); } catch (e) { /* ignore invalid date string */ }
                  } else if (typeof dateValue === 'number') { // Handle potential epoch numbers
                    try { date = new Date(dateValue); } catch (e) { /* ignore invalid number */ }
                  }
                  
                  return date ? formatDistanceToNow(date, { addSuffix: true }) : 'Date unavailable';
                })()}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default DocumentGrid;
