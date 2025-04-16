import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FavoriteDocument, MyDocumentData } from '@/types';
import { Button } from '@/components/ui/button';
import { Bookmark, File, FileText, Star } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/use-toast';

interface FavoriteDocumentsProps {
  userId: string;
  onDocumentSelect: (document: MyDocumentData) => void;
  onRefreshFavorites: () => void;
}

export function FavoriteDocuments({ userId, onDocumentSelect, onRefreshFavorites }: FavoriteDocumentsProps) {
  const [favoriteDocuments, setFavoriteDocuments] = useState<MyDocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch favorite documents
  useEffect(() => {
    const fetchFavoriteDocuments = async () => {
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
        const documents: MyDocumentData[] = [];
        
        for (const docId of favoriteDocIds) {
          const docRef = doc(db, 'users', userId, 'documents', docId);
          const docSnap = await getDocs(collection(db, 'users', userId, 'documents'));
          
          docSnap.docs.forEach(doc => {
            if (favoriteDocIds.includes(doc.id)) {
              const docData = {
                id: doc.id,
                ...doc.data(),
                isFavorite: true
              } as MyDocumentData;
              documents.push(docData);
            }
          });
        }
        
        setFavoriteDocuments(documents);
      } catch (err) {
        console.error('Error fetching favorite documents:', err);
        setError('Failed to load favorite documents');
      } finally {
        setLoading(false);
      }
    };
    
    fetchFavoriteDocuments();
  }, [userId]);

  // Handle document selection
  const handleDocumentClick = (document: MyDocumentData) => {
    onDocumentSelect(document);
  };

  // Render loading state
  if (loading) {
    return (
      <div className="space-y-2">
        <h3 className="text-lg font-semibold flex items-center">
          <Star className="h-4 w-4 mr-2 text-yellow-500" />
          Favorites
        </h3>
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="space-y-2">
        <h3 className="text-lg font-semibold flex items-center">
          <Star className="h-4 w-4 mr-2 text-yellow-500" />
          Favorites
        </h3>
        <div className="p-4 text-red-500">{error}</div>
      </div>
    );
  }

  // Render empty state
  if (favoriteDocuments.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-lg font-semibold flex items-center">
          <Star className="h-4 w-4 mr-2 text-yellow-500" />
          Favorites
        </h3>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <Bookmark className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p>No favorite documents yet</p>
              <p className="text-sm">Star documents to add them here</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render favorite documents
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold flex items-center">
        <Star className="h-4 w-4 mr-2 text-yellow-500" />
        Favorites
      </h3>
      <ScrollArea className="h-[200px]">
        <div className="space-y-2">
          {favoriteDocuments.map((doc) => (
            <Card 
              key={doc.id} 
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => handleDocumentClick(doc)}
            >
              <CardContent className="p-3 flex items-center">
                {doc.contentType?.includes('pdf') ? (
                  <FileText className="h-5 w-5 mr-2 text-red-500" />
                ) : (
                  <File className="h-5 w-5 mr-2 text-blue-500" />
                )}
                <div className="flex-1 truncate">{doc.name}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// Helper function to toggle favorite status
export async function toggleFavorite(userId: string, document: MyDocumentData) {
  if (!userId || !document.id) {
    toast({
      title: "Error",
      description: "Unable to update favorite status",
      variant: "destructive"
    });
    return false;
  }

  try {
    const favoriteRef = doc(db, 'users', userId, 'favorites', document.id);
    
    if (document.isFavorite) {
      // Remove from favorites
      await deleteDoc(favoriteRef);
      toast({
        title: "Removed from favorites",
        description: `"${document.name}" has been removed from your favorites`,
      });
      return false;
    } else {
      // Add to favorites
      const favoriteData: FavoriteDocument = {
        id: document.id,
        documentId: document.id,
        userId: userId,
        addedAt: Timestamp.now(),
        documentName: document.name
      };
      
      await setDoc(favoriteRef, favoriteData);
      toast({
        title: "Added to favorites",
        description: `"${document.name}" has been added to your favorites`,
      });
      return true;
    }
  } catch (error) {
    console.error("Error toggling favorite status:", error);
    toast({
      title: "Error",
      description: "Failed to update favorite status",
      variant: "destructive"
    });
    return document.isFavorite || false;
  }
}
