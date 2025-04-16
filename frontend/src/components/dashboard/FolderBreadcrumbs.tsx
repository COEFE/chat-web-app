'use client';

import { FolderData } from '@/types';
import { ChevronRight } from 'lucide-react';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Fragment } from 'react';

interface FolderBreadcrumbsProps {
  currentFolderId: string | null;
  folders: FolderData[];
  onNavigate: (folderId: string | null) => void;
}

export default function FolderBreadcrumbs({ currentFolderId, folders, onNavigate }: FolderBreadcrumbsProps) {
  console.log('[FolderBreadcrumbs] Rendering with:', { currentFolderId, folderCount: folders.length });
  // Function to get folder path (from root to current folder)
  const getFolderPath = (folderId: string | null, allFolders: FolderData[]): FolderData[] => {
    console.log('[FolderBreadcrumbs] Getting path for folder:', folderId);
    console.log('[FolderBreadcrumbs] All folders count:', allFolders.length);
    
    // If no folder ID or empty folders array, return empty path
    if (!folderId || allFolders.length === 0) {
      console.log('[FolderBreadcrumbs] No folder ID or empty folders array');
      return [];
    }
    
    const folder = allFolders.find(f => f.id === folderId);
    console.log('[FolderBreadcrumbs] Found folder:', folder);
    
    // If folder not found in the array, return empty path
    if (!folder) {
      console.log('[FolderBreadcrumbs] Folder not found in array');
      return [];
    }
    
    // Build the path recursively from the current folder to the root
    const parentPath = folder.parentFolderId ? getFolderPath(folder.parentFolderId, allFolders) : [];
    const result = [...parentPath, folder];
    console.log('[FolderBreadcrumbs] Path result:', result.map(f => ({ id: f.id, name: f.name })));
    return result;
  };

  // Get the current folder path
  const folderPath = getFolderPath(currentFolderId, folders);
  
  // Get siblings for a given folder (folders with the same parent)
  const getSiblings = (folderId: string | null, parentFolderId: string | null, allFolders: FolderData[]): FolderData[] => {
    console.log('[FolderBreadcrumbs] Getting siblings for folder:', folderId, 'with parent:', parentFolderId);
    
    // If empty folders array, return empty siblings
    if (allFolders.length === 0) {
      console.log('[FolderBreadcrumbs] Empty folders array, no siblings');
      return [];
    }
    
    const siblings = allFolders.filter(f => f.parentFolderId === parentFolderId && f.id !== folderId);
    console.log('[FolderBreadcrumbs] Found siblings:', siblings.map(f => ({ id: f.id, name: f.name })));
    return siblings;
  };

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Button 
              variant="ghost" 
              className="p-0 h-auto font-normal hover:bg-transparent hover:underline"
              onClick={() => {
                console.log('[FolderBreadcrumbs] Navigating to Home (null)');
                console.log('[FolderBreadcrumbs] Current folder path:', folderPath.map(f => ({ id: f.id, name: f.name })));
                onNavigate(null);
              }}
            >
              Home
            </Button>
          </BreadcrumbLink>
        </BreadcrumbItem>
        
        {folderPath.map((folder, index) => {
          const isLast = index === folderPath.length - 1;
          const siblings = getSiblings(folder.id, folder.parentFolderId, folders);
          
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

