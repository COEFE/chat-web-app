import React, { useState, useEffect } from 'react';
import { storage } from '@/lib/firebaseConfig'; // Corrected import path
import { ref, getMetadata } from 'firebase/storage';
import { formatBytes } from '@/lib/utils'; // Revert to alias
import { Loader2 } from 'lucide-react';

interface DocumentMetadataFetcherProps {
  storagePath?: string | null;
}

const DocumentMetadataFetcher: React.FC<DocumentMetadataFetcherProps> = ({ storagePath }) => {
  const [size, setSize] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storagePath) {
      setSize(null); // Or display '-' or similar for items without path
      return;
    }

    let isMounted = true;
    const fetchMetadata = async () => {
      setLoading(true);
      setError(null);
      try {
        const fileRef = ref(storage, storagePath);
        const metadata = await getMetadata(fileRef);
        if (isMounted) {
          setSize(metadata.size);
        }
      } catch (err) {
        console.warn(`[MetadataFetcher] Failed to get metadata for ${storagePath}:`, err);
        if (isMounted) {
          setError('N/A'); // Indicate metadata fetch failed
          setSize(null); // Clear size on error
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchMetadata();

    return () => {
      isMounted = false; // Cleanup function to prevent state updates on unmounted component
    };
  }, [storagePath]); // Re-fetch if storagePath changes

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  if (error) {
    return <span className="text-xs text-muted-foreground">{error}</span>;
  }

  if (size !== null) {
    return <span className="text-xs text-muted-foreground">{formatBytes(size)}</span>;
  }
  
  // If no storage path or size is null after trying
  return <span className="text-xs text-muted-foreground">-</span>; 
};

export default DocumentMetadataFetcher;
