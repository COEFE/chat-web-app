'use client';

import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryState } from 'nuqs'; // Import useQueryState
import { useAuth } from '@/context/AuthContext';
import { db, functionsInstance, storage } from '@/lib/firebaseConfig';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  addDoc, 
  serverTimestamp, 
  updateDoc, 
  doc, 
  deleteDoc, 
  Timestamp, 
  getDoc,
  writeBatch
} from 'firebase/firestore';
import { ref as storageRef, getMetadata } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import DocumentViewer from '@/components/dashboard/DocumentViewer';
import { FilesystemItem, MyDocumentData, FolderData, BreadcrumbItem } from '@/types'; 
import { formatBytes, cn } from '@/lib/utils'; 
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { 
  Folder, 
  FileText, 
  Plus, 
  MoreHorizontal, 
  Eye, 
  Pencil, 
  Trash2, 
  Move, 
  Loader2, 
  List, 
  LayoutGrid, 
  Upload, 
  FolderPlus, 
  RefreshCw, 
  EyeOff, 
  Maximize2, 
  Minimize2, 
  ArrowUpDown, 
  ChevronRight, 
  ChevronDown, 
  FileImage, 
  FileVideo, 
  FileAudio, 
  FileSpreadsheet, 
  FileCode, 
  FileArchive, 
  Columns 
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter, 
  DialogTrigger
} from "@/components/ui/dialog"; 
import { 
  ToggleGroup, 
  ToggleGroupItem, 
} from "@/components/ui/toggle-group"
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle, 
} from "@/components/ui/card";
import { 
  Table as ShadcnTable, 
  TableCell, 
  TableHead, 
  TableRow 
} from "@/components/ui/table";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuLabel, 
  DropdownMenuRadioGroup, 
  DropdownMenuRadioItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger, 
  DropdownMenuItem, 
  DropdownMenuCheckboxItem 
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { 
  ColumnDef, 
  ColumnFiltersState, 
  SortingState, 
  VisibilityState, 
  GroupingState, 
  ExpandedState, 
  flexRender, 
  getCoreRowModel, 
  getFilteredRowModel, 
  getPaginationRowModel, 
  getSortedRowModel, 
  getGroupedRowModel, 
  getExpandedRowModel, 
  useReactTable, 
  Row, 
  Cell 
} from "@tanstack/react-table";
import { MoveDocumentModal } from '@/components/dashboard/MoveDocumentModal';
import Breadcrumbs from '@/components/dashboard/Breadcrumbs';
import DocumentGrid from '@/components/dashboard/DocumentGrid';
import ChatInterface from '@/components/dashboard/ChatInterface'; 
import { FileUpload } from '@/components/dashboard/FileUpload';
import { ListTree } from 'lucide-react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DraggableRow } from '@/components/dashboard/DraggableRow'; 
import FolderBreadcrumbs from '@/components/dashboard/FolderBreadcrumbs'; 
import Link from 'next/link'; // Import Link

import { 
  formatDistanceToNow, 
  parseISO, 
  isToday, 
  isYesterday, 
  isThisWeek, 
  isThisMonth, 
  format 
} from 'date-fns';

interface DocumentTableProps {
  data: FilesystemItem[];
  isLoading: boolean;
  error: string | null;
  onSelectItem: (item: FilesystemItem | null) => void;
  onDeleteDocument: (docId: string) => Promise<void>;
  onFolderClick: (folderId: string, folderName: string) => void;
  onMoveClick: (itemId: string, itemName: string, itemType: 'document' | 'folder') => void;
  onRenameFolder: (folderId: string, currentName: string) => void;
  onDeleteFolder: (folderId: string, folderName: string) => void;
  initialGrouping?: GroupingState;
  onMoveRow: (dragIndex: number, hoverIndex: number) => void; 
  onDropItemIntoFolder: (itemId: string, targetFolderId: string) => void; 
}

const createColumns = (
  onSelectItem: (item: FilesystemItem | null) => void,
  onFolderClick: (folderId: string, folderName: string) => void,
  onMoveClick: (itemId: string, itemName: string, itemType: 'document' | 'folder') => void,
  onRenameFolder: (folderId: string, currentName: string) => void,
  onDeleteFolder: (folderId: string, folderName: string) => void,
  handleDeleteClick: (item: FilesystemItem, e: React.MouseEvent) => void,
  isDeleting: boolean,
  deletingId: string | null
): ColumnDef<FilesystemItem>[] => {
  // Helper to get the appropriate icon based on item type and content type
  const getFileTypeIcon = (item: FilesystemItem) => {
    if (item.type === 'folder') {
      return <Folder className="h-4 w-4 mr-2 flex-shrink-0 text-sky-500" />;
    }

    const contentType = item.contentType?.toLowerCase() || '';
    const fileName = item.name?.toLowerCase() || '';

    if (contentType.startsWith('image/')) return <FileImage className="h-4 w-4 mr-2 flex-shrink-0 text-purple-500" />;
    if (contentType.startsWith('video/')) return <FileVideo className="h-4 w-4 mr-2 flex-shrink-0 text-orange-500" />;
    if (contentType.startsWith('audio/')) return <FileAudio className="h-4 w-4 mr-2 flex-shrink-0 text-yellow-500" />;
    if (contentType === 'application/pdf') return <FileText className="h-4 w-4 mr-2 flex-shrink-0 text-red-500" />;
    if (contentType.includes('spreadsheet') || contentType.includes('excel') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) return <FileSpreadsheet className="h-4 w-4 mr-2 flex-shrink-0 text-green-600" />;
    if (contentType.includes('word') || contentType.includes('document') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) return <FileText className="h-4 w-4 mr-2 flex-shrink-0 text-blue-600" />;
    if (contentType.includes('presentation') || fileName.endsWith('.pptx') || fileName.endsWith('.ppt')) return <FileText className="h-4 w-4 mr-2 flex-shrink-0 text-orange-600" />; // Placeholder icon 
    if (contentType.includes('zip') || contentType.includes('archive') || fileName.endsWith('.zip') || fileName.endsWith('.rar') || fileName.endsWith('.7z')) return <FileArchive className="h-4 w-4 mr-2 flex-shrink-0 text-gray-500" />;
    if (contentType.includes('code') || contentType.startsWith('text/') || fileName.endsWith('.js') || fileName.endsWith('.ts') || fileName.endsWith('.py') || fileName.endsWith('.java') || fileName.endsWith('.html') || fileName.endsWith('.css')) return <FileCode className="h-4 w-4 mr-2 flex-shrink-0 text-indigo-500" />;

    return <FileText className="h-4 w-4 mr-2 flex-shrink-0 text-gray-400" />; // Default file icon
  };

  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const item = row.original;
        const isSelected = false; // Simplified, assuming selection state isn't directly managed here
        const icon = getFileTypeIcon(item);

        if (item.type === 'folder') {
          return (
            <button
              onClick={(e) => {
                e.stopPropagation(); // Prevent row selection if clicking folder name itself
                onSelectItem(null); // Clear document selection when clicking folder
                onFolderClick(item.id, item.name); // Use passed prop
              }}
              className={`flex items-center text-left w-full px-0 py-0 bg-transparent border-none cursor-pointer hover:underline ${isSelected ? 'font-semibold' : ''}`}
            >
              {icon}
              <span className="truncate">{item.name}</span>
            </button>
          );
        } else {
          return (
            <div
              onClick={() => onSelectItem(item)} // Allow selection on the div
              className={`flex items-center cursor-pointer ${isSelected ? 'font-semibold' : ''}`}
            >
              {icon}
              <span className="truncate">{item.name}</span>
            </div>
          );
        }
      },
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const item = row.original;
        if (item.type === 'folder') {
          return <span className="text-gray-600">Folder</span>;
        } else {
          // Attempt to extract a user-friendly type from contentType
          const contentType = item.contentType || 'File';
          const simpleType = contentType.split('/').pop() || contentType; // Use pop() for potentially complex types like application/vnd.ms-excel
          return <span className="capitalize truncate text-gray-600">{simpleType}</span>;
        }
      },
      enableGrouping: true, // Allow grouping by Type
      enableSorting: false, // Sorting by derived type might be less useful
    },
    {
      accessorKey: 'size',
      header: 'Size',
      cell: ({ row }) => {
        const item = row.original;
        if (item.type === 'document') {
          // Use the formatBytes utility
          return <span className="text-gray-600">{formatBytes(item.size)}</span>;
        } else {
          return <span className="text-gray-600">-</span>; // Folders don't have a size in this context
        }
      },
      enableSorting: true, // Allow sorting by size
    },
    {
      accessorKey: 'updatedAt',
      header: 'Date Modified',
      cell: ({ row }: { row: Row<FilesystemItem> }) => {
        const item = row.original;
        if (!item.updatedAt) return <span>-</span>;

        let dateString: string;
        // Check if updatedAt is Firebase Timestamp or ISO string
        if (item.updatedAt instanceof Timestamp) {
          dateString = formatDistanceToNow(item.updatedAt.toDate(), { addSuffix: true });
        } else if (typeof item.updatedAt === 'string') {
          try {
            dateString = formatDistanceToNow(parseISO(item.updatedAt), { addSuffix: true });
          } catch {
            dateString = 'Invalid Date';
          }
        } else {
          dateString = '-';
        }

        return <span>{dateString}</span>;
      },
      meta: {
        className: 'hidden md:table-cell', 
      },
      enableGrouping: true, // Enable grouping by Date
      getGroupingValue: (item: FilesystemItem) => { // Use item directly
        if (!item.updatedAt) return 'Unknown Date';

        let date: Date;
        // Check if updatedAt is Firebase Timestamp or ISO string
        if (item.updatedAt instanceof Timestamp) {
          date = item.updatedAt.toDate();
        } else if (typeof item.updatedAt === 'string') {
          try {
            date = parseISO(item.updatedAt);
          } catch (e) {
            console.error("Error parsing date string:", item.updatedAt, e);
            return 'Invalid Date Format'; // More specific error
          }
        } else {
          return 'Unknown Date Type'; // Handle other potential types
        }

        if (isNaN(date.getTime())) { // Check if date is valid after parsing
             return 'Invalid Date Value'; // More specific error
        }

        const now = new Date();
        if (isToday(date)) return 'Today';
        if (isYesterday(date)) return 'Yesterday';
        if (isThisWeek(date, { weekStartsOn: 1 })) return 'This Week'; // Assuming week starts on Monday
        if (isThisMonth(date)) return 'This Month';
        // Example: Group by year for older dates
        return format(date, 'yyyy'); // Or 'Older', or 'yyyy-MM' for monthly grouping
      }, // End of getGroupingValue function
      enableSorting: true, // Ensure sorting is also enabled if needed
    },
    {
      id: 'actions',
      header: () => <div className="text-right pr-2">Actions</div>, 
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="text-right pr-2"> 
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8" 
                  onClick={(e: React.MouseEvent) => e.stopPropagation()} 
                  data-testid={`actions-button-${item.id}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {item.type === 'folder' ? (
                  <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); onRenameFolder(item.id, item.name); }}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); onSelectItem(item); }}>
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); onMoveClick(item.id, item.name, item.type); }}>
                  <Move className="mr-2 h-4 w-4" />
                  Move
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-red-600 focus:text-red-600 focus:bg-red-100"
                  onClick={(e: React.MouseEvent) => handleDeleteClick(item, e)} 
                  data-testid={`delete-button-${item.id}`}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableHiding: false, 
      size: 100, 
    },
  ];
};

function DocumentTable({ 
  data, 
  isLoading, 
  error, 
  onSelectItem, 
  onDeleteDocument, 
  onFolderClick, 
  onMoveClick, 
  onRenameFolder, 
  onDeleteFolder, 
  initialGrouping, 
  onMoveRow, 
  onDropItemIntoFolder, 
}: DocumentTableProps) {
  const [itemToDelete, setItemToDelete] = useState<FilesystemItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null); 
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [grouping, setGrouping] = useState<GroupingState>(initialGrouping ?? []); // Initialize with prop
  const [expanded, setExpanded] = useState<ExpandedState>({}); // Use correct type
  const { toast } = useToast();

  useEffect(() => {
    console.log('[DocumentTable] Data prop updated:', data.map(item => item.name)); // Log names using the 'data' prop
  }, [data]);

  const handleDeleteClick = (item: FilesystemItem, e: React.MouseEvent) => {
    e.stopPropagation(); 
    setItemToDelete(item);
  };

  const columns = useMemo(
    () => createColumns(onSelectItem, onFolderClick, onMoveClick, onRenameFolder, onDeleteFolder, handleDeleteClick, isDeleting, deletingId),
    [onSelectItem, onFolderClick, onMoveClick, onRenameFolder, onDeleteFolder, handleDeleteClick, isDeleting, deletingId]
  );

  // Set up pagination with 20 items per page
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
  });

  const table = useReactTable({
    data, // Use the 'data' prop passed to the component
    columns,
    getRowId: (originalRow) => originalRow.id, // Provide a stable row ID
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(), // Add grouped row model
    getExpandedRowModel: getExpandedRowModel(), // Add expanded row model
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGroupingChange: setGrouping, // Add grouping change handler
    onExpandedChange: setExpanded, // Add expanded change handler
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      grouping, // Include grouping in state
      expanded, // Include expanded in state
      pagination, // Include pagination in state
    },
  });

  const handleRowClick = (item: FilesystemItem) => {
    if (item.type === 'folder') {
      onFolderClick(item.id, item.name);
    } else {
      onSelectItem(item);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 flex-grow overflow-auto pr-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between p-2 border rounded">
            <div className="flex items-center space-x-2 flex-grow">
              <Skeleton circle={true} height={24} width={24} />
              <Skeleton height={20} width={`80%`} />
            </div>
            <Skeleton height={20} width={60} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-red-500 p-4">Error loading items: {error}</p>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] overflow-auto"> 
       {/* Column Toggle Button removed from here - moved to toolbar */}

      {/* TanStack Table Rendering */} 
      <div className="rounded-md border"> 
        <ShadcnTable className="min-w-full">
          <thead className={cn("[&_tr]:border-b")}> 
            {table.getHeaderGroups().map((headerGroup) => ( 
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as { className?: string } | undefined;
                  return (
                    <TableHead key={header.id} className={meta?.className}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </thead> 
          <tbody className={cn("[&_tr:last-child]:border-0")}> 
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => { 
                if (row.getIsGrouped()) {
                  // Render group header row
                  return (
                    <TableRow key={row.id} className="bg-muted/50 hover:bg-muted/80 font-medium">
                      <TableCell colSpan={columns.length} className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={row.getToggleExpandedHandler()}
                            style={{ cursor: 'pointer' }}
                            className="p-1 rounded hover:bg-accent"
                          >
                            {row.getIsExpanded() ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          {/* Display the formatted group value - uses accessorKey of grouping column */} 
                          <span>{String(row.groupingValue ?? 'Other')}</span>
                          <span className="text-xs text-muted-foreground">({row.subRows.length})</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }
                
                // Render normal data row (only if expanded or not part of a group)
                if (!row.getIsGrouped() && (row.depth === 0 || row.getParentRow()?.getIsExpanded())) {
                  return (
                    <DraggableRow key={row.id} row={row} onMoveRow={onMoveRow} onDropItemIntoFolder={onDropItemIntoFolder}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell 
                          key={cell.id} 
                          className={cn(
                            (cell.column.columnDef.meta as { className?: string })?.className, // Type assertion for meta
                            {'cursor-pointer hover:bg-muted/50': cell.column.id !== 'actions' && cell.column.id !== 'select'},
                            {'bg-blue-100 dark:bg-blue-900': row.getIsSelected()} 
                          )}
                          style={{ width: cell.column.getSize() }} 
                          onClick={(e) => handleRowClick(row.original)} 
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </DraggableRow>
                  );
                }
                
                return null; // Don't render hidden sub-rows
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No documents or folders found.
                </TableCell>
              </TableRow>
            )}
          </tbody> 
        </ShadcnTable>
        
        {/* Pagination Controls */}
        <div className="flex items-center justify-between px-4 py-2 border-t">
          <div className="flex-1 text-sm text-muted-foreground">
            Showing {table.getFilteredRowModel().rows.length > 0 ? table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1 : 0} to {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)} of {table.getFilteredRowModel().rows.length} items
          </div>
          <div className="flex items-center space-x-6 lg:space-x-8">
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={itemToDelete !== null} onOpenChange={(open: boolean) => !open && setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the {itemToDelete?.type === 'folder' ? 'folder' : 'document'}
              {' '}
              <span className="font-medium">'{itemToDelete?.name}'</span>.
              {itemToDelete?.type === 'folder' && ' All contents within this folder will also be deleted.'} 
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)} disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!itemToDelete) return;

              setDeletingId(itemToDelete.id);
              setIsDeleting(true);

              if (itemToDelete.type === 'document') {
                onDeleteDocument(itemToDelete.id)
                  .catch((error: unknown) => {
                    console.error(`Error deleting document ${itemToDelete.id}:`, error);
                    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
                    toast({ variant: "destructive", title: "Error", description: `Failed to delete document '${itemToDelete.name}'. ${message}` });
                  })
                  .finally(() => {
                    setIsDeleting(false);
                    setItemToDelete(null); 
                  });
              } else if (itemToDelete.type === 'folder') {
                const deleteFolderFunction = httpsCallable(functionsInstance, 'deleteFolder');
                deleteFolderFunction({ folderId: itemToDelete.id })
                  .then((result) => {
                    const responseData = result.data as { success: boolean; message?: string };

                    if (responseData.success) {
                      toast({ title: "Success", description: `Folder '${itemToDelete.name}' and its contents deleted successfully.` });
                    } else {
                      throw new Error(responseData.message || 'Unknown error from function.');
                    }
                  })
                  .catch((error: unknown) => {
                    console.error(`Error calling deleteFolder function for ${itemToDelete.id}:`, error);
                    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
                    toast({ variant: "destructive", title: "Error", description: `Failed to delete folder '${itemToDelete.name}'. ${message}` });
                  })
                  .finally(() => {
                    setIsDeleting(false);
                    setItemToDelete(null); 
                  });
              }
            }} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<MyDocumentData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [filesystemItems, setFilesystemItems] = useState<FilesystemItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<BreadcrumbItem[]>([]); 
  const [docId, setDocId] = useQueryState('docId'); 
  const [activeDocumentData, setActiveDocumentData] = useState<MyDocumentData | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isViewerVisible, setIsViewerVisible] = useState(true);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  const [folderToRename, setFolderToRename] = useState<{id: string; currentName: string} | null>(null);
  const [newRenameFolderName, setNewRenameFolderName] = useState("");
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [movingDocument, setMovingDocument] = useState<{ id: string; name: string } | null>(null);
  const [availableFolders, setAvailableFolders] = useState<FolderData[]>([]);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list'); 
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false); 
  const [groupingOption, setGroupingOption] = useState<'type' | 'date' | 'none'>('none'); // Control grouping UI

  const panelGroupRef = useRef<any>(null);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  async function fetchItems(folderId: string | null = null) {
    // Use the provided folderId or fall back to the current state
    // Handle null explicitly to avoid confusion
    const targetFolderId = folderId !== undefined ? folderId : currentFolderId;
    console.log(`[fetchItems] Using targetFolderId:`, targetFolderId, 'from input:', folderId, 'current state:', currentFolderId);
    
    if (authLoading) {
      console.log('Auth is loading, skipping fetch.');
      return;
    }
    if (!user) {
      console.log('User not logged in, redirecting.');
      router.push('/login');
      return;
    }

    console.log(`Fetching items for user: ${user.uid}, folderId: ${targetFolderId}`);
    setLoadingDocs(true);
    setDocsError(null);
    setFilesystemItems([]);

    try {
      const userId = user.uid;

      // Query for folders in the current folder
      const foldersQuery = query(
        collection(db, 'users', userId, 'folders'),
        where('parentFolderId', '==', targetFolderId),
        orderBy('name', 'asc')
      );
      console.log(`[fetchItems] Querying folders with parentFolderId: ${targetFolderId}`);
      const folderSnapshot = await getDocs(foldersQuery);
      const fetchedFolders: FolderData[] = folderSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as Omit<FolderData, 'id'>
      }));
      const folderItems: FilesystemItem[] = fetchedFolders.map(f => ({ ...f, type: 'folder' }));
      console.log('Fetched Folders:', fetchedFolders.map(f => ({ id: f.id, name: f.name, parentFolderId: f.parentFolderId })));

      // Fetch documents in the current folder
      let documentSnapshot;
      try {
        const documentsQueryByCreatedAt = query(
          collection(db, 'users', userId, 'documents'),
          where('folderId', '==', targetFolderId),
          orderBy('createdAt', 'desc') 
        );
        
        console.log(`[Dashboard] Executing Firestore query for documents with folderId: ${targetFolderId}`);
        documentSnapshot = await getDocs(documentsQueryByCreatedAt);
        console.log('[Dashboard] Successfully retrieved documents sorted by creation date');
      } catch (indexError) {
        console.warn('[Dashboard] Index error, falling back to name sorting:', indexError);
        
        const documentsQueryByName = query(
          collection(db, 'users', userId, 'documents'),
          where('folderId', '==', targetFolderId),
          orderBy('name', 'asc')
        );
        
        console.log('[Dashboard] Falling back to name-based sorting query...');
        documentSnapshot = await getDocs(documentsQueryByName);
      }
      
      console.log(`[Dashboard] Document query complete for folderId: ${targetFolderId}, found: ${documentSnapshot.docs.length} documents`);
      
      const fetchedDocs: MyDocumentData[] = documentSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        uploadedAt: doc.data().uploadedAt as Timestamp,
        createdAt: doc.data().createdAt as Timestamp,
        updatedAt: doc.data().updatedAt as Timestamp,
      } as MyDocumentData));
      const documentItems: FilesystemItem[] = fetchedDocs.map(d => ({ ...d, type: 'document' }));
      console.log(`[Dashboard] Processed ${fetchedDocs.length} documents into UI items`);

      // Fetch Metadata from Storage for each document
      const docsWithMetadata = await Promise.all(fetchedDocs.map(async (docData) => {
        let metadataProps: { size?: number; contentType?: string } = {};
        if (docData.storagePath) {
          try {
            const fileRef = storageRef(storage, docData.storagePath);
            const metadata = await getMetadata(fileRef);
            console.log(`[Dashboard] Fetched metadata for ${docData.name}: size=${metadata.size}, type=${metadata.contentType}`);
            metadataProps = { 
              size: metadata.size, 
              contentType: metadata.contentType 
            };
          } catch (error) {
            console.warn(`[Dashboard] Failed to get metadata for ${docData.name} (${docData.storagePath}):`, error);
            // Keep metadataProps empty if fetch fails
          }
        } else {
          console.warn(`[Dashboard] Document ${docData.name} missing storagePath.`);
        }
        // Combine original data, metadata, and explicitly add type
        return { 
          ...docData, 
          ...metadataProps, 
          type: 'document' // Explicitly add the type property
        } as FilesystemItem; // Assert type here for clarity
      }));

      // Combine and sort folders first, then by name
      const combinedItems: FilesystemItem[] = [...folderItems, ...docsWithMetadata].sort((a, b) => {
        // Sort folders before documents
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        
        // If both are the same type, sort by name (case-insensitive)
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });
      
      setFilesystemItems(combinedItems);
      console.log(`[Dashboard] Updated UI with ${combinedItems.length} total items (folders first, then sorted by name)`);

    } catch (error) {
      console.error('[Dashboard] Error fetching documents or folders:', error);
      setDocsError(`Failed to load items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleSelectItem = (item: FilesystemItem | null) => {
    console.log('Item selected:', item);
    if (item?.type === 'document') {
      // Set the docId query parameter when a document is selected
      console.log('Setting docId query param to:', item.id);
      setDocId(item.id);
      // Fetching data will be handled by a useEffect watching docId
      // router.push(`/document-chat/${item.id}`); // <-- Remove navigation
    } else if (item?.type === 'folder') {
      console.log('Folder selected, clearing docId');
      // Clear the docId when a folder is selected or selection is cleared
      setDocId(null); 
    } else {
      console.log('Selection cleared, clearing docId');
      // Clear the docId when selection is cleared
      setDocId(null); 
    }
  };

  const handleFolderClick = useCallback((folderId: string, folderName: string) => {
    console.log(`Navigating into folder: ${folderName} (${folderId})`);
    setCurrentFolderId(folderId);
    setFolderPath(prev => [...prev, { id: folderId, name: folderName }]);
    setDocId(null); // Clear selected document when changing folders
  }, [setCurrentFolderId, setFolderPath, setDocId]); // Add setDocId dependency

  const handleNavigate = useCallback((folderId: string | null) => {
    setDocId(null); // Deselect document when navigating folders via breadcrumbs
    if (folderId === null) {
      router.push('/dashboard'); // Navigate to root using router
    } else {
      router.push(`/dashboard?folderId=${folderId}`); // Navigate to specific folder using router
    }
  }, [router, setDocId]); // Add setDocId dependency

  const handleUploadSuccess = () => {
    console.log("Upload complete signal received, refreshing current folder...");
    triggerRefresh();
    setIsUploadDialogOpen(false); // Close dialog on success
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!user) {
      console.error('No user available for deleting document');
      throw new Error('Authentication required');
    }
    
    let token: string | null = null;
    try {
      token = await user.getIdToken();
    } catch (tokenError) {
      console.error("Failed to get ID token for delete operation", tokenError);
      throw new Error('Authentication error. Please refresh and try again.');
    }
    
    console.log(`Attempting to delete document with ID: ${docId}`); 

    const response = await fetch(`/api/documents?id=${docId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log('Delete API Response Status:', response.status); 

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' })); 
      console.error('Delete API Error Response:', errorData); 
      throw new Error(errorData.message || `Failed to delete document. Status: ${response.status}`);
    }

    console.log('Document deleted successfully via API.'); 
    toast({ title: "Success", description: "Document deleted successfully." });

    await triggerRefresh(); 

  };

  const handleCreateFolder = async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to create a folder." });
      return;
    }
    if (!newFolderName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Folder name cannot be empty." });
      return;
    }

    setIsCreatingFolder(true);
    try {
      const createFolderFunction = httpsCallable(functionsInstance, 'createFolder');
      await createFolderFunction({
        name: newFolderName.trim(),
        parentFolderId: currentFolderId
      });
      toast({ title: "Folder created", description: `Folder "${newFolderName.trim()}" created successfully.` });
      setShowCreateFolderDialog(false);
      setNewFolderName("");
      triggerRefresh();
    } catch (error) {
      console.error("Error creating folder:", error);
      toast({ variant: "destructive", title: "Error", description: `Failed to create folder: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  async function fetchAllFolders() {
    if (!user) return;
    console.log(`Fetching all folders for user: ${user.uid}`);
    try {
      setIsLoadingFolders(true); 
      const foldersRef = collection(db, `users/${user.uid}/folders`);
      const q = query(foldersRef, orderBy('name', 'asc'));
      const querySnapshot = await getDocs(q);
      const fetchedFolders: FolderData[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as FolderData));
      setAvailableFolders(fetchedFolders);
    } catch (error) {
      console.error('Error fetching all folders:', error);
      toast({ variant: "destructive", title: "Error", description: "Could not load folders for moving." });
      setAvailableFolders([]); 
    } finally {
      setIsLoadingFolders(false); 
    }
  };

  const handleOpenMoveModal = (itemId: string, itemName: string, itemType: 'document' | 'folder') => {
    if (availableFolders.length === 0) {
      fetchAllFolders(); 
    }
    setMovingDocument({ id: itemId, name: itemName });
    setIsMoveModalOpen(true);
  };

  const handleMoveConfirm = useCallback(async (targetFolderId: string | null) => {
    if (!movingDocument) return;

    console.log(`Attempting to move ${movingDocument.id} to ${targetFolderId}`);
    try {
      const moveDocFunc = httpsCallable(functionsInstance, 'moveDocument'); 
      await moveDocFunc({ 
        documentId: movingDocument.id, 
        targetFolderId: targetFolderId 
      });
      setIsMoveModalOpen(false); 
      setMovingDocument(null);
      toast({ title: "Success", description: `Moved '${movingDocument.name}' successfully.` });
      fetchAllFolders(); 
      fetchItems(currentFolderId); 
    } catch (error: any) {
      console.error("Error moving document:", error);
      const message = error?.details?.message || error?.message || 'An unknown error occurred';
      toast({ 
        variant: "destructive", 
        title: "Error Moving Document", 
        description: `Failed to move document: ${message}` 
      });
    }
  }, [
    movingDocument, 
    functionsInstance, 
    toast, 
    currentFolderId, 
    setIsMoveModalOpen, 
    setMovingDocument
  ]);

  const handleRenameFolder = (folderId: string, currentName: string) => {
    setFolderToRename({ id: folderId, currentName });
    setNewRenameFolderName(currentName); 
  };
  
  const confirmRenameFolder = async () => {
    if (!folderToRename || !newRenameFolderName.trim() || !user) return;
    
    setIsRenamingFolder(true);
    const { id, currentName } = folderToRename;
    const trimmedNewName = newRenameFolderName.trim();
    
    if (trimmedNewName === currentName) {
      setIsRenamingFolder(false);
      setFolderToRename(null);
      return;
    }
    
    try {
      const renameFolderFunction = httpsCallable<
        { folderId: string; newName: string },
        { success: boolean; message?: string }
      >(functionsInstance, 'renameFolder');
      
      const result = await renameFolderFunction({ 
        folderId: id, 
        newName: trimmedNewName 
      });
      
      const responseData = result.data as { success: boolean; message?: string };
      
      if (responseData.success) {
        toast({ 
          title: "Success", 
          description: `Folder renamed to '${trimmedNewName}' successfully.` 
        });
        
        setFolders(prev => prev.map(folder => 
          folder.id === id ? { ...folder, name: trimmedNewName } : folder
        ));
        
        if (currentFolderId === id) {
          setFolderPath(prev => prev.map(item => 
            item.id === id ? { ...item, name: trimmedNewName } : item
          ));
        }

        triggerRefresh();
      } else {
        throw new Error(responseData.message || 'Unknown error occurred');
      }
    } catch (error) {
      console.error(`Error renaming folder ${id}:`, error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: `Failed to rename folder: ${message}` 
      });
    } finally {
      setIsRenamingFolder(false);
      setFolderToRename(null);
      setNewRenameFolderName("");
    }
  };

  const handleDeleteFolder = (folderId: string, folderName: string) => {
    console.log(`Delete folder requested: ${folderName} (${folderId})`);
  };

  const handleGroupingChange = (value: string) => { // Accept string from radio group
    setGroupingOption(value as 'type' | 'date' | 'none'); // Update accepted types
  };

  const handleMoveRow = useCallback((dragIndex: number, hoverIndex: number) => {
    setFilesystemItems((prevItems) => {
      const newItems = [...prevItems];
      // Remove the dragged item from its original position
      const [draggedItem] = newItems.splice(dragIndex, 1);
      // Insert the dragged item into the new position
      newItems.splice(hoverIndex, 0, draggedItem);
      return newItems;
    });
    // Note: This currently only reorders the visual state.
    // Persisting this order would require adding an 'order' field 
    // to Firestore documents/folders and updating them here if desired.
    console.log(`Moved item from index ${dragIndex} to ${hoverIndex} in local state.`);
  }, []); // Use useCallback to prevent unnecessary re-renders

  const handleDropItemIntoFolder = useCallback(async (itemId: string, targetFolderId: string) => {
    console.log(`Attempting to move item ${itemId} into folder ${targetFolderId}`);
    const itemToMove = filesystemItems.find(item => item.id === itemId);

    if (!itemToMove) {
      toast({ variant: 'destructive', title: 'Error moving item', description: 'Could not find the item to move.' });
      return;
    }

    const collectionName = itemToMove.type === 'folder' ? 'folders' : 'documents';
    const itemRef = doc(db, collectionName, itemId);

    try {
      await updateDoc(itemRef, {
        parentId: targetFolderId,
        updatedAt: Timestamp.now(),
      });

      // Optimistically remove the item from the current view
      setFilesystemItems((prevItems) => prevItems.filter(item => item.id !== itemId));

      toast({ title: `Successfully moved ${itemToMove.type}`, description: `Moved '${itemToMove.name}' into target folder.` });
      console.log(`Successfully moved item ${itemId} to folder ${targetFolderId} in Firestore.`);
      // Optionally, trigger a re-fetch or navigate if needed

    } catch (error) {
      console.error("Error moving item into folder:", error);
      toast({ variant: 'destructive', title: 'Error Moving Item', description: 'Failed to update the item in the database.' });
    }
  }, [filesystemItems]);  // Effect to fetch items when the current folder changes
  useEffect(() => {
    if (authLoading) {
      console.log('Auth is loading, skipping fetch.');
      return;
    }
    if (!user) {
      console.log('User not logged in, redirecting.');
      router.push('/login');
      return;
    }

    console.log(`[useEffect] Fetching items for folder: ${currentFolderId}`);
    
    // Fetch all folders for breadcrumb navigation
    fetchAllFolders();
    
    // Call fetchItems with the current folder ID
    // This will handle setting loading state and error state
    fetchItems(currentFolderId);
    
  }, [user, authLoading, router, currentFolderId, refreshTrigger]);

  const handleNavigateFolder = (folderId: string | null) => {
    console.log("[DashboardPage] handleNavigateFolder called with:", folderId);
    console.log("[DashboardPage] Current folder ID before change:", currentFolderId);
    
    // Don't do anything if we're already in this folder
    if (folderId === currentFolderId) {
      console.log("[DashboardPage] Already in this folder, no navigation needed");
      return;
    }
    
    // Update state
    setCurrentFolderId(folderId);
    setDocId(null); // Clear selected document when changing folders
    setSelectedDocument(null); // Clear selection when changing folders
    
    // Force an immediate fetch without waiting for the effect
    const userId = user?.uid;
    if (!userId) return;
    
    console.log("[DashboardPage] Manually fetching items for folder:", folderId);
    setLoadingDocs(true);
    setDocsError(null);
    
    // Call the fetchItems function directly with the new folder ID
    // This bypasses the useEffect dependency on currentFolderId
    const fetchFolderItems = async () => {
      try {
        // Make sure we're passing the folder ID explicitly
        await fetchItems(folderId);
      } catch (error) {
        console.error("Error fetching items:", error);
        setDocsError("Failed to load items");
      } finally {
        setLoadingDocs(false);
      }
    };
    
    fetchFolderItems();
  };

  useEffect(() => {
    const fetchActiveDocument = async () => {
      if (docId && user) {
        console.log(`[Effect] docId changed to: ${docId}, fetching document data...`);
        setLoadingDocs(true); // Reuse loading state or add a specific one
        try {
          const docRef = doc(db, 'users', user.uid, 'documents', docId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const fetchedDoc = {
              id: docSnap.id,
              ...docSnap.data(),
              uploadedAt: docSnap.data().uploadedAt as Timestamp,
              createdAt: docSnap.data().createdAt as Timestamp,
              updatedAt: docSnap.data().updatedAt as Timestamp,
            } as MyDocumentData;
            console.log('[Effect] Found active document:', fetchedDoc.name);
            setActiveDocumentData(fetchedDoc);
            // Automatically show viewer if a doc is loaded via URL
            if (!isViewerVisible) {
              setIsViewerVisible(true);
            }
          } else {
            console.warn(`[Effect] Document with id ${docId} not found.`);
            toast({
              variant: "destructive",
              title: "Document Not Found",
              description: "The selected document could not be found. It might have been deleted.",
            });
            setActiveDocumentData(null);
            setDocId(null); // Clear the invalid docId from the URL
          }
        } catch (error) {
          console.error('[Effect] Error fetching active document:', error);
          toast({
            variant: "destructive",
            title: "Error Loading Document",
            description: `Failed to load the selected document: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
          setActiveDocumentData(null);
          setDocId(null); // Clear the problematic docId
        } finally {
          setLoadingDocs(false);
        }
      } else {
        console.log('[Effect] docId is null or user not available, clearing active document.');
        setActiveDocumentData(null);
      }
    };

    fetchActiveDocument();
  }, [docId, user, toast, setDocId]); // Add dependencies

  if (authLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>Loading...</div>;
  }

  const allFolders = useMemo(() => {
    return filesystemItems.filter(item => item.type === 'folder') as FolderData[];
  }, [filesystemItems]);

  return (
    <div className="flex h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 flex h-8 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 py-1">
        <h1 className="text-base font-semibold whitespace-nowrap">My Documents</h1>
        <Link href="/chat-history" className="text-sm text-blue-600 hover:underline">
          Chat History
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Welcome, {user.displayName || user.email}</span>
          <Button variant="outline" size="sm" className="h-6 text-xs py-0" onClick={logout}>Logout</Button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-4 pt-2">
        <div className="mb-2 text-xs text-muted-foreground">
          <FolderBreadcrumbs 
            currentFolderId={currentFolderId}
            folders={availableFolders}
            onNavigate={handleNavigateFolder}
          />
        </div>

        <div className="flex h-full flex-col">
          {activeDocumentData && (
            <>
              <div className="flex justify-end mb-2 gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsMaximized(prev => !prev)}
                  title={isMaximized ? "Exit full screen" : "Full screen"}
                >
                  {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsViewerVisible(prev => !prev)}
                  title={isViewerVisible ? "Hide document viewer" : "Show document viewer"}
                >
                  {isViewerVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              
              {/* Document Viewer and Chat Interface */}
              {isViewerVisible && (
                <div className={`mb-4 ${isMaximized ? 'fixed inset-0 z-50 bg-background p-6' : 'h-[60vh] overflow-auto border rounded-md'}`}>
                  <div className="h-full flex flex-col">
                    <DocumentViewer document={activeDocumentData} />
                    <ChatInterface documentId={activeDocumentData.id} document={activeDocumentData} />
                  </div>
                </div>
              )}
            </>
          )}
          
          <div className={`flex-1 flex flex-col overflow-hidden ${isMaximized && isViewerVisible ? 'hidden' : ''}`}>
            {/* Favorites Section removed to simplify UI and reduce whitespace */}

            {/* Document List/Grid Section - Takes remaining space */}
            <div className="flex-1 overflow-hidden p-3"> {/* Container for document section */} 
              {/* Document Management Toolbar */} 
              <div className="mb-2"> {/* Reduced margin-bottom */} 
                <div className="flex items-center justify-between bg-muted/30 p-1.5 rounded-md">
                  {/* Left side - Primary Actions */} 
                  <div className="flex items-center space-x-1.5">
                    {/* New Button with Dropdown */}
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="default" size="sm" className="h-7 px-2.5">
                          <Plus className="h-3.5 w-3.5 mr-1.5" />
                          <span className="text-xs">New</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => setShowCreateFolderDialog(true)}>
                          <FolderPlus className="h-4 w-4 mr-2" />
                          New Folder
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setIsUploadDialogOpen(true)}>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Document
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    
                    {/* Refresh Button */}
                    <Button variant="ghost" size="icon" onClick={triggerRefresh} title="Refresh Documents" className="h-7 w-7 p-0">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                                    {/* Right side - View Controls */}
                  <div className="flex items-center space-x-1.5">
                    {/* Grouping Control */}
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2">
                          <ListTree className="h-3.5 w-3.5 mr-1.5" /> 
                          <span className="text-xs">
                            {groupingOption === 'type' ? 'By Type' : groupingOption === 'date' ? 'By Date' : 'No Groups'}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Group By</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioGroup value={groupingOption} onValueChange={handleGroupingChange}>
                          <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="type">Type</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="date">Date</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    
                    {/* Columns Control - Moved here */}
                    {viewMode === 'list' && (
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 px-2">
                            <Columns className="h-3.5 w-3.5 mr-1.5" />
                            <span className="text-xs">Columns</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {viewMode === 'list' && filesystemItems.length > 0 && (
                            <>
                              {/* This is a placeholder for column visibility toggles */}
                              <DropdownMenuCheckboxItem
                                className="capitalize"
                                checked={true}
                              >
                                Name
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                className="capitalize"
                                checked={true}
                              >
                                Type
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                className="capitalize"
                                checked={true}
                              >
                                Size
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                className="capitalize"
                                checked={true}
                              >
                                Date Modified
                              </DropdownMenuCheckboxItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    
                    {/* View Mode Toggle */}
                    <div className="border-l border-muted-foreground/20 pl-1.5 ml-0.5">
                      <ToggleGroup 
                        type="single" 
                        defaultValue="list" 
                        value={viewMode}
                        onValueChange={(value: 'list' | 'grid') => {
                          if (value === 'list' || value === 'grid') {
                            setViewMode(value);
                          }
                        }}
                        aria-label="View mode"
                        className="h-7"
                      >
                        <ToggleGroupItem value="list" aria-label="List view" className="h-7 w-7 p-0">
                          <List className="h-3.5 w-3.5" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="grid" aria-label="Grid view" className="h-7 w-7 p-0">
                          <LayoutGrid className="h-3.5 w-3.5" />
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Upload Dialog */}
              <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen} modal={false}>
                <DialogContent className="sm:max-w-[525px]">
                  <DialogHeader>
                    <DialogTitle>Upload Document</DialogTitle>
                    <DialogDescription>
                      Drag & drop files here or click to select. Files will be added to: <span className='font-medium'>{folderPath[folderPath.length - 1]?.name ?? 'Home'}</span>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="pt-4 pb-0"> 
                    <FileUpload
                      onUploadComplete={handleUploadSuccess} // This should close the dialog
                      currentFolderId={currentFolderId}
                    />
                  </div>
                </DialogContent>
              </Dialog>
              
              {/* Document Section Header - More Compact */}
              <div className="flex justify-between items-center mb-1 mt-2 flex-shrink-0">                <div className="flex items-center">
                  <h2 className="text-sm font-medium">Documents</h2>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({folderPath.length > 0 ? folderPath[folderPath.length - 1].name : 'Home'}) • 
                    {filesystemItems.length} {filesystemItems.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </div>
              {loadingDocs ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span>Loading items...</span>
                </div>
              ) : docsError ? (
                <div className="text-red-600 p-4 text-center border border-red-300 rounded-md bg-red-50">
                  {docsError}
                </div>
              ) : (
                <>
                  <div className="h-[calc(100vh-220px)] overflow-auto">
                    {viewMode === 'list' ? (
                      <DndProvider backend={HTML5Backend}>
                        <DocumentTable 
                          data={filesystemItems}
                          isLoading={loadingDocs}
                          error={docsError}
                          onSelectItem={handleSelectItem} 
                          onDeleteDocument={handleDeleteDocument}
                          onFolderClick={handleNavigateFolder}
                          onMoveClick={handleOpenMoveModal} 
                          onRenameFolder={handleRenameFolder} 
                          onDeleteFolder={handleDeleteFolder} 
                          initialGrouping={ 
                            groupingOption === 'type' ? ['type'] : 
                            groupingOption === 'date' ? ['updatedAt'] : 
                            [] 
                          } 
                          onMoveRow={handleMoveRow} 
                          onDropItemIntoFolder={handleDropItemIntoFolder}
                        />
                      </DndProvider>
                    ) : (
                      <DocumentGrid 
                        items={filesystemItems}
                        isLoading={loadingDocs}
                        error={docsError}
                        onSelectItem={handleSelectItem}
                        onFolderClick={handleNavigateFolder}
                        onDeleteDocument={handleDeleteDocument}
                        onDeleteFolder={handleDeleteFolder}
                        onMoveClick={handleOpenMoveModal} 
                        onRenameFolder={handleRenameFolder}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog} modal={false}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for your new folder.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="folder-name" className="text-right">
                Name
              </Label>
              <Input 
                id="folder-name" 
                value={newFolderName} 
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFolderName(e.target.value)} 
                className="col-span-3" 
                placeholder="My Project Files"
                disabled={isCreatingFolder}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateFolderDialog(false)} disabled={isCreatingFolder}>Cancel</Button>
            <Button 
              type="button" 
              onClick={handleCreateFolder} 
              disabled={isCreatingFolder || !newFolderName.trim()}
            >
              {isCreatingFolder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isCreatingFolder ? 'Creating...' : 'Create Folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={!!folderToRename} onOpenChange={(open) => !open && setFolderToRename(null)} modal={false}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>
              Enter a new name for the folder "{folderToRename?.currentName}".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="rename-folder-name" className="text-right">
                Name
              </Label>
              <Input
                id="rename-folder-name"
                value={newRenameFolderName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRenameFolderName(e.target.value)}
                className="col-span-3"
                placeholder="Enter new folder name"
                autoFocus
                disabled={isRenamingFolder}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setFolderToRename(null)} 
              disabled={isRenamingFolder}
            >
              Cancel
            </Button>
            <Button 
              type="button"
              onClick={confirmRenameFolder} 
              disabled={!newRenameFolderName.trim() || isRenamingFolder}
            >
              {isRenamingFolder ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Renaming...
                </>
              ) : (
                'Rename'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Document Modal */}
      <MoveDocumentModal 
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        documentName={movingDocument?.name || ''}
        folders={availableFolders} 
        onConfirmMove={handleMoveConfirm} 
        isLoadingFolders={isLoadingFolders}
      />
    </div>
  );
}

export default DashboardPage;
