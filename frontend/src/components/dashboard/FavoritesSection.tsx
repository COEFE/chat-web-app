import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FavoriteDocument, MyDocumentData, FilesystemItem } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bookmark, File, FileText, Star, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface FavoritesSectionProps {
  userId: string;
  onSelectItem: (item: FilesystemItem) => void;
}

export function FavoritesSection({ userId, onSelectItem }: FavoritesSectionProps) {
  const [favoriteDocuments, setFavoriteDocuments] = useState<FilesystemItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Function to toggle expanded state
  const toggleExpanded = () => setIsExpanded(prev => !prev);

  useEffect(() => {
    const fetchFavorites = async () => {
      if (!userId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Get all favorite document references for this user
        const favoritesRef = collection(db, 'users', userId, 'favorites');
        const favoritesQuery = query(favoritesRef, orderBy('addedAt', 'desc'));
        const favoritesSnapshot = await getDocs(favoritesQuery);
        
        if (favoritesSnapshot.empty) {
          setFavoriteDocuments([]);
          setLoading(false);
          return;
        }
        
        // Get the document IDs from the favorites
        const favoriteDocIds = favoritesSnapshot.docs.map(doc => {
          const data = doc.data() as FavoriteDocument;
          return data.documentId;
        });
        
        // Fetch the actual documents
        const documents: FilesystemItem[] = [];
        
        // Query all documents
        const docsRef = collection(db, 'users', userId, 'documents');
        const docsSnapshot = await getDocs(docsRef);
        
        // Filter to only include favorited documents
        docsSnapshot.docs.forEach(doc => {
          if (favoriteDocIds.includes(doc.id)) {
            const docData = doc.data() as MyDocumentData;
            documents.push({
              ...docData,
              id: doc.id,
              type: 'document',
              isFavorite: true
            });
          }
        });
        
        setFavoriteDocuments(documents);
      } catch (err) {
        console.error('Error fetching favorite documents:', err);
        setError('Failed to load favorite documents');
      } finally {
        setLoading(false);
      }
    };
    
    fetchFavorites();
    
    // Set up event listener for refreshing favorites
    const handleRefresh = () => {
      fetchFavorites();
    };
    
    window.addEventListener('refreshDocuments', handleRefresh);
    
    return () => {
      window.removeEventListener('refreshDocuments', handleRefresh);
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center">
            <Star className="h-4 w-4 mr-2 text-yellow-500" />
            Favorites
          </h3>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center">
            <Star className="h-4 w-4 mr-2 text-yellow-500" />
            Favorites
          </h3>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Card>
          <CardContent className="p-2 text-red-500 text-xs">
            {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (favoriteDocuments.length === 0) {
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center">
            <Star className="h-4 w-4 mr-2 text-yellow-500" />
            Favorites
          </h3>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Card className="border-dashed border-muted w-full">
          <CardContent className="py-2 px-2">
            <div className="text-center text-muted-foreground text-xs">
              <Bookmark className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p>No favorites yet</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Display either collapsed or expanded view based on state
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center">
          <Star className="h-4 w-4 mr-2 text-yellow-500" />
          Favorites ({favoriteDocuments.length})
        </h3>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 w-7 p-0"
          onClick={toggleExpanded}
          aria-label={isExpanded ? "Collapse favorites" : "Expand favorites"}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      {isExpanded ? (
        // Expanded view with all favorites
        <ScrollArea className="h-[120px]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {favoriteDocuments.map((doc) => (
              <Card 
                key={doc.id} 
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => onSelectItem(doc)}
              >
                <CardContent className="p-2 flex items-center">
                  {doc.type === 'document' && (doc as MyDocumentData & { type: 'document' }).contentType?.includes('pdf') ? (
                    <FileText className="h-4 w-4 mr-2 text-red-500" />
                  ) : (
                    <File className="h-4 w-4 mr-2 text-blue-500" />
                  )}
                  <div className="flex-1 truncate text-sm">{doc.name}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      ) : (
        // Collapsed view with just a few favorites
        <div className="flex space-x-1.5 overflow-hidden">
          {favoriteDocuments.slice(0, 3).map((doc) => (
            <Card 
              key={doc.id} 
              className="cursor-pointer hover:bg-muted/50 transition-colors flex-shrink-0 w-[180px]"
              onClick={() => onSelectItem(doc)}
            >
              <CardContent className="p-2 flex items-center">
                {doc.type === 'document' && (doc as MyDocumentData & { type: 'document' }).contentType?.includes('pdf') ? (
                  <FileText className="h-4 w-4 mr-1.5 text-red-500 flex-shrink-0" />
                ) : (
                  <File className="h-4 w-4 mr-1.5 text-blue-500 flex-shrink-0" />
                )}
                <div className="flex-1 truncate text-sm">{doc.name}</div>
              </CardContent>
            </Card>
          ))}
          {favoriteDocuments.length > 3 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={toggleExpanded}
            >
              +{favoriteDocuments.length - 3} more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
