'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FilesystemItem } from '@/types';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Folder, FileText, Star } from 'lucide-react'; // Add icons
import { cn } from '@/lib/utils';

interface FavoritesDialogProps {
  trigger: React.ReactNode; // Allow custom trigger element
  allItems: FilesystemItem[];
  favoriteIds: Set<string>;
  onSelectItem: (item: FilesystemItem) => void;
  onFolderClick: (folderId: string, folderName: string) => void;
  handleToggleFavorite: (itemId: string, currentStatus: boolean) => Promise<void>;
  togglingFavoriteId: string | null;
}

const FavoritesDialog: React.FC<FavoritesDialogProps> = ({
  trigger,
  allItems,
  favoriteIds,
  onSelectItem,
  onFolderClick,
  handleToggleFavorite,
  togglingFavoriteId
}) => {

  const favoriteItems = allItems.filter(item => favoriteIds.has(item.id));

  // Helper to get the appropriate icon based on item type and content type
  const getFileTypeIcon = (item: FilesystemItem) => {
    if (item.type === 'folder') {
      return <Folder className="h-5 w-5 mr-3 flex-shrink-0 text-blue-500" />;
    }
    // Add more specific icons based on contentType if needed
    return <FileText className="h-5 w-5 mr-3 flex-shrink-0 text-gray-500" />;
  };

  const handleItemClick = (item: FilesystemItem) => {
    if (item.type === 'folder') {
      onFolderClick(item.id, item.name);
    } else {
      onSelectItem(item);
    }
    // Consider closing the dialog after selection? Or maybe not.
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader className="items-center !sm:text-center">
          <DialogTitle>Favorite Items</DialogTitle>
          <DialogDescription>
            Quickly access your most used documents and folders.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[400px] w-full pr-4">
          {favoriteItems.length > 0 ? (
            <ul className="space-y-2">
              {favoriteItems.map((item) => (
                <li key={item.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-accent w-full overflow-hidden">
                  <button 
                    className="flex items-center text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm min-w-0 max-w-[80%] overflow-hidden"
                    onClick={() => handleItemClick(item)}
                    title={`Open ${item.name}`}
                  >
                    <div className="flex-shrink-0">
                      {getFileTypeIcon(item)}
                    </div>
                    <span className="truncate text-sm font-medium block w-full">{item.name}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary flex-shrink-0 ml-auto focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                    onClick={() => handleToggleFavorite(item.id, true)} // Always true because it's currently a favorite
                    disabled={togglingFavoriteId === item.id}
                    title="Remove from Favorites"
                    aria-label="Remove from Favorites"
                  >
                    <Star 
                       className={cn(
                        "h-4 w-4 fill-yellow-400 text-yellow-500",
                        togglingFavoriteId === item.id && "animate-pulse"
                      )}
                    />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-4">
              You haven't marked any items as favorites yet.
            </p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default FavoritesDialog;
