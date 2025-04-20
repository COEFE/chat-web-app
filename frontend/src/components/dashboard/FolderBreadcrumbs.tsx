'use client';

import { FolderData } from '@/types';
import { ChevronRight } from 'lucide-react';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Fragment, memo, useMemo } from 'react';

interface FolderBreadcrumbsProps {
  currentFolderId: string | null;
  folders: FolderData[];
  onNavigate: (folderId: string | null) => void;
}

// Define the component
function FolderBreadcrumbsBase({ currentFolderId, folders, onNavigate }: FolderBreadcrumbsProps) {
  // Function to get folder path (from root to current folder) - no logging
  const getFolderPath = (folderId: string | null, allFolders: FolderData[]): FolderData[] => {
    // If no folder ID or empty folders array, return empty path
    if (!folderId || allFolders.length === 0) {
      return [];
    }
    
    const folder = allFolders.find(f => f.id === folderId);
    
    // If folder not found in the array, return empty path
    if (!folder) {
      return [];
    }
    
    // Build the path recursively from the current folder to the root
    const parentPath = folder.parentFolderId ? getFolderPath(folder.parentFolderId, allFolders) : [];
    return [...parentPath, folder];
  };

  // Get the current folder path - memoized to prevent recalculation on every render
  const folderPath = useMemo(() => {
    return getFolderPath(currentFolderId, folders);
  }, [currentFolderId, folders]);
  
  // Get siblings for a given folder (folders with the same parent) - memoized
  const getSiblings = useMemo(() => {
    return (folderId: string | null, parentFolderId: string | null): FolderData[] => {
      // If empty folders array, return empty siblings
      if (folders.length === 0) {
        return [];
      }
      
      return folders.filter(f => f.parentFolderId === parentFolderId && f.id !== folderId);
    };
  }, [folders]);

  // Only render breadcrumbs when not at the root folder
  if (!currentFolderId) {
    return null;
  }
  
  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Button 
              variant="ghost" 
              className="p-0 h-auto font-normal hover:bg-transparent hover:underline"
              onClick={() => {
                // Navigate to home folder
                onNavigate(null);
              }}
            >
              Home
            </Button>
          </BreadcrumbLink>
        </BreadcrumbItem>
        
        {folderPath.map((folder, index) => {
          const isLast = index === folderPath.length - 1;
          const siblings = getSiblings(folder.id, folder.parentFolderId);
          
          return (
            <Fragment key={folder.id}>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{folder.name}</BreadcrumbPage>
                ) : (
                  <>
                    {siblings.length > 0 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            className="p-0 h-auto font-normal hover:bg-transparent hover:underline"
                          >
                            {folder.name}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => onNavigate(folder.id)}>
                            {folder.name}
                          </DropdownMenuItem>
                          {siblings.map(sibling => (
                            <DropdownMenuItem 
                              key={sibling.id}
                              onClick={() => {
                                console.log('[FolderBreadcrumbs] Navigating to sibling folder:', sibling.id, sibling.name);
                                onNavigate(sibling.id);
                              }}
                            >
                              {sibling.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Button 
                          variant="ghost" 
                          className="p-0 h-auto font-normal hover:bg-transparent hover:underline"
                          onClick={() => {
                            console.log('[FolderBreadcrumbs] Navigating to folder from dropdown:', folder.id, folder.name);
                            onNavigate(folder.id);
                          }}
                        >
                          {folder.name}
                        </Button>
                      </BreadcrumbLink>
                    )}
                  </>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

// Export a memoized version of the component to prevent unnecessary re-renders
const FolderBreadcrumbs = memo(FolderBreadcrumbsBase);
export default FolderBreadcrumbs;

