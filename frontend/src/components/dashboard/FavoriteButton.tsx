import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';
import { toggleFavorite } from './FavoriteDocuments';
import { MyDocumentData } from '@/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface FavoriteButtonProps {
  document: MyDocumentData;
  userId: string;
  onToggle?: (isFavorite: boolean) => void;
}

export function FavoriteButton({ document, userId, onToggle }: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState<boolean>(document.isFavorite || false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click event
    
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      const newStatus = await toggleFavorite(userId, document);
      setIsFavorite(newStatus);
      if (onToggle) {
        onToggle(newStatus);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${isFavorite ? 'text-yellow-500' : 'text-muted-foreground hover:text-yellow-500'}`}
            onClick={handleToggleFavorite}
            disabled={isUpdating}
          >
            <Star className={`h-4 w-4 ${isFavorite ? 'fill-yellow-500' : ''}`} />
            <span className="sr-only">{isFavorite ? 'Remove from favorites' : 'Add to favorites'}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
