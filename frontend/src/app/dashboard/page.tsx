"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { app, db, storage } from "@/lib/firebaseConfig"; // Ensure 'app', 'db', and 'storage' are exported
import { getFunctions, httpsCallable, Functions } from "firebase/functions"; // Import necessary functions and type
import { ThemeToggle } from "@/components/ui/theme-toggle";
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
  writeBatch,
  setDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { ref as storageRef, getMetadata } from "firebase/storage";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import DocumentViewer from "@/components/dashboard/DocumentViewer";
import DocumentMetadataFetcher from "@/components/dashboard/DocumentMetadataFetcher"; // Import the new component
import {
  FilesystemItem,
  MyDocumentData,
  FolderData,
  BreadcrumbItem,
} from "@/types";
import { formatBytes, cn } from "@/lib/utils";
import { clsx } from "clsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  File,
  LayersIcon,
  LayoutGrid,
  List,
  ListTree,
  Loader2,
  Maximize2,
  Menu,
  MessageSquarePlus,
  Minimize2,
  MoreHorizontal,
  Move,
  Pencil,
  Plus,
  PlusCircle,
  Receipt,
  RefreshCw,
  Send,
  Share,
  Share2,
  Slash,
  SlidersHorizontal,
  Star,
  Tag,
  Text,
  Trash2,
  Upload,
  User,
  X as XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
// Badge component removed
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import {
  ColumnDef,
  SortingState,
  VisibilityState,
  ColumnFiltersState,
  GroupingState,
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  PaginationState, // Added PaginationState
  useReactTable,
  OnChangeFn,
  Row, // Add Row back to imports
} from "@tanstack/react-table";
import { MoveDocumentModal } from "@/components/dashboard/MoveDocumentModal";
import Breadcrumbs from "@/components/dashboard/Breadcrumbs";
import DocumentGrid from "@/components/dashboard/DocumentGrid";
import ChatInterface from "@/components/dashboard/ChatInterface";
import { FileUpload } from "@/components/dashboard/FileUpload";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { DraggableRow } from "@/components/dashboard/DraggableRow";
import FolderBreadcrumbs from "@/components/dashboard/FolderBreadcrumbs";
import Link from "next/link"; // Import Link
import FavoritesDialog from "@/components/dashboard/FavoritesDialog"; // Import FavoritesDialog
import {
  format,
  isValid,
  formatDistanceToNow,
  parseISO,
  isToday,
  isYesterday,
  isThisWeek,
  isThisMonth,
  parse,
} from "date-fns"; // Restore necessary date-fns imports
import { ShareDialog } from "@/components/dashboard/ShareDialog"; // Add this
import { usePathname } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox"; // Import Checkbox

interface DocumentTableProps {
  data: FilesystemItem[];
  isLoading: boolean;
  error: string | null;
  onSelectItem: (item: FilesystemItem | null) => void;
  onDeleteDocument: (docId: string) => Promise<void>;
  onFolderClick: (folderId: string, folderName: string) => void;
  onMoveClick: (
    itemId: string,
    itemName: string,
    itemType: "document" | "folder"
  ) => void;
  onRenameFolder: (folderId: string, currentName: string) => void;
  onDeleteFolder: (folderId: string, folderName: string) => void;
  grouping: GroupingState;
  onGroupingChange: OnChangeFn<GroupingState>; // Use OnChangeFn type
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>; // Use OnChangeFn type
  onMoveRow: (dragIndex: number, hoverIndex: number) => void;
  onDropItemIntoFolder: (itemId: string, targetFolderId: string) => void;
  favoriteIds: Set<string>;
  handleToggleFavorite: (
    itemId: string,
    currentStatus: boolean
  ) => Promise<void>;
  togglingFavoriteId: string | null;
  onOpenShareDialog: (doc: { id: string; name: string }) => void; // Add the missing prop
  mobileViewColumn: "none" | "uploadedAt" | "updatedAt" | "size" | "type";
  onToggleMobileViewColumn: () => void;
}

const createColumns = (
  onSelectItem: (item: FilesystemItem | null) => void,
  onFolderClick: (folderId: string, folderName: string) => void,
  onMoveClick: (
    itemId: string,
    itemName: string,
    itemType: "document" | "folder"
  ) => void,
  onRenameFolder: (folderId: string, currentName: string) => void,
  onDeleteFolder: (folderId: string, folderName: string) => void,
  handleDeleteClick: (item: FilesystemItem, e: React.MouseEvent) => void,
  isDeleting: boolean,
  deletingId: string | null,
  favoriteIds: Set<string>,
  handleToggleFavorite: (
    itemId: string,
    currentStatus: boolean
  ) => Promise<void>,
  togglingFavoriteId: string | null,
  onOpenShareDialog: (doc: { id: string; name: string }) => void, // Add the missing prop
  isMobile: boolean,
  highlightRow: (id: string) => void
): ColumnDef<FilesystemItem>[] => {
  // Helper to get the appropriate icon based on item type and content type
  const getFileTypeIcon = (item: FilesystemItem) => {
    if (item.type === "folder") {
      return (
        <Folder className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0 text-sky-500" />
      );
    }

    const contentType = item.contentType?.toLowerCase() || "";
    const fileName = item.name?.toLowerCase() || "";

    if (contentType.startsWith("image/"))
      return (
        <FileImage className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0 text-purple-500" />
      );
    if (contentType.startsWith("video/"))
      return (
        <FileVideo className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0 text-orange-500" />
      );
    if (contentType.startsWith("audio/"))
      return (
        <FileAudio className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0 text-yellow-500" />
      );
    if (contentType === "application/pdf")
      return (
        <FileText className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0 text-red-500" />
      );
    if (
      contentType.includes("spreadsheet") ||
      contentType.includes("excel") ||
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls") ||
      fileName.endsWith(".csv")
    )
      return (
        <FileSpreadsheet className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0 text-green-600" />
      );
    if (
      contentType.includes("word") ||
      contentType.includes("document") ||
      fileName.endsWith(".docx") ||
      fileName.endsWith(".doc")
    )
      return (
        <FileText className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0 text-blue-600" />
      );
    if (
      contentType.includes("presentation") ||
      fileName.endsWith(".pptx") ||
      fileName.endsWith(".ppt")
    )
      return (
        <FileText className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0 text-orange-600" />
      ); // Placeholder icon
    if (
      contentType.includes("zip") ||
      contentType.includes("archive") ||
      fileName.endsWith(".zip") ||
      fileName.endsWith(".rar") ||
      fileName.endsWith(".7z")
    )
      return (
        <FileArchive className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0 text-gray-500" />
      );
    if (
      contentType.includes("code") ||
      contentType.startsWith("text/") ||
      fileName.endsWith(".js") ||
      fileName.endsWith(".ts") ||
      fileName.endsWith(".py") ||
      fileName.endsWith(".java") ||
      fileName.endsWith(".html") ||
      fileName.endsWith(".css")
    )
      return (
        <FileCode className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0 text-indigo-500" />
      );

    return (
      <FileText className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0 text-gray-400" />
    ); // Default file icon
  };

  return [
    // Selection column for multi-select
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center px-0 sm:px-2 w-[28px] h-full">
          <Checkbox
            aria-label="Select all"
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
          />
        </div>
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          indeterminate={row.getIsSomeSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 28, // narrower to reduce gap on mobile
      meta: {
        className: "px-0 sm:px-2 w-[28px] min-w-[28px] max-w-[28px]",
      }, // minimal padding on mobile
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-0 sm:-ml-4"
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const item = row.original;
        const icon = getFileTypeIcon(item);

        if (item.type === "folder") {
          return (
            <div className="flex items-center group min-w-0">
              {icon}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFolderClick(item.id, item.name);
                }}
                className="hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm truncate max-w-[220px] sm:max-w-[345px]"
                title={item.name}
              >
                {item.name}
              </button>
            </div>
          );
        } else {
          return (
            <div className="flex items-center group min-w-0">
              {icon}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectItem(item);
                  if (isMobile) highlightRow(item.id);
                }}
                className="truncate max-w-[220px] sm:max-w-[345px] cursor-pointer hover:underline"
                title={item.name}
              >
                {item.name}
              </span>
            </div>
          );
        }
      },
      meta: { className: "px-0 sm:px-4 sm:w-[345px]" }, // Expand Name column width by 15% on desktop
    },
    {
      accessorKey: "type",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-0 sm:-ml-4"
        >
          Type
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const item = row.original;
        if (item.type === "folder") {
          return <span className="text-gray-600">Folder</span>;
        } else {
          // Attempt to extract a user-friendly type from contentType
          const contentType = item.contentType || "File";
          let simpleType = contentType.split("/").pop() || contentType; // Use pop() for potentially complex types like application/vnd.ms-excel

          // Truncate if too long
          const maxLength = 15;
          if (simpleType.length > maxLength) {
            simpleType = simpleType.substring(0, maxLength) + "...";
          }

          return (
            <span
              className="capitalize truncate text-gray-600"
              title={contentType}
            >
              {simpleType}
            </span>
          );
        }
      },
      enableGrouping: true, // Allow grouping by Type
      enableSorting: true, // Allow sorting by type
      enableHiding: true, // Allow hiding this column
      getGroupingValue: (item: FilesystemItem) => {
        if (item.type === "folder") {
          return "Folder";
        } else {
          // Extract file type from contentType for grouping
          const contentType = item.contentType || "";

          // Handle common content types
          if (contentType.includes("pdf")) return "PDF";
          if (
            contentType.includes("spreadsheet") ||
            contentType.includes("excel") ||
            contentType.includes("ms-excel")
          )
            return "Excel";
          if (contentType.includes("word") || contentType.includes("document"))
            return "Word";
          if (
            contentType.includes("presentation") ||
            contentType.includes("powerpoint")
          )
            return "PowerPoint";
          if (contentType.includes("image/")) return "Image";
          if (contentType.includes("text/")) return "Text";
          if (contentType.includes("audio/")) return "Audio";
          if (contentType.includes("video/")) return "Video";

          // For other types, extract the subtype after the slash
          const parts = contentType.split("/");
          if (parts.length > 1 && parts[1]) {
            // Clean up and capitalize the subtype
            return parts[1].split(";")[0].toUpperCase();
          }

          return "Other";
        }
      },
      meta: {
        className: "w-1/5 sm:w-auto", // Narrow Type column to 20% on mobile
      },
    },
    {
      accessorKey: "size",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-0 sm:-ml-4"
        >
          Size
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const item = row.original;
        if (item.type === "folder") {
          return <span className="text-sm text-muted-foreground">-</span>; // Folders don't have size
        }
        // Use the DocumentMetadataFetcher for documents
        return <DocumentMetadataFetcher storagePath={item.storagePath} />;
      },
      enableSorting: true, // Allow sorting by size
      enableGrouping: false, // Size doesn't make sense for grouping
      enableHiding: true, // Allow hiding this column
      meta: {
        className: "w-1/6 sm:w-auto", // Narrow Size column to 16.7% on mobile
      },
    },
    {
      accessorKey: "uploadedAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-0 sm:-ml-4"
        >
          Date Added
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const item = row.original;
        let date: Date | null = null;

        // Use uploadedAt for documents, createdAt for folders as the 'added' date
        const dateValue =
          item.type === "document" ? item.uploadedAt : item.createdAt;

        if (dateValue) {
          if (dateValue instanceof Timestamp) {
            date = dateValue.toDate();
          } else if (typeof dateValue === "string") {
            try {
              date = parseISO(dateValue);
            } catch {
              /* ignore */
            }
          } else if (typeof dateValue === "number") {
            // Handle epoch
            try {
              date = new Date(dateValue);
            } catch {
              /* ignore */
            }
          }
        }

        // Format the date if it's valid
        return date && isValid(date) ? (
          <div className="text-sm text-muted-foreground">
            {format(date, "MMM d, yyyy")}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">--</div>
        );
      },
      sortingFn: (rowA, rowB, columnId) => {
        const itemA = rowA.original;
        const itemB = rowB.original;
        let dateA: number | null = null;
        let dateB: number | null = null;

        const dateValueA =
          itemA.type === "document" ? itemA.uploadedAt : itemA.createdAt;
        const dateValueB =
          itemB.type === "document" ? itemB.uploadedAt : itemB.createdAt;

        if (dateValueA instanceof Timestamp)
          dateA = dateValueA.toDate().getTime();
        else if (typeof dateValueA === "string")
          try {
            dateA = parseISO(dateValueA).getTime();
          } catch {
            /* ignore */
          }
        else if (typeof dateValueA === "number")
          try {
            dateA = new Date(dateValueA).getTime();
          } catch {
            /* ignore */
          }

        if (dateValueB instanceof Timestamp)
          dateB = dateValueB.toDate().getTime();
        else if (typeof dateValueB === "string")
          try {
            dateB = parseISO(dateValueB).getTime();
          } catch {
            /* ignore */
          }
        else if (typeof dateValueB === "number")
          try {
            dateB = new Date(dateValueB).getTime();
          } catch {
            /* ignore */
          }

        if (dateA === null && dateB === null) return 0;
        if (dateA === null) return -1; // Nulls first (or last depending on sort direction)
        if (dateB === null) return 1;

        return dateA - dateB;
      },
      enableSorting: true, // Allow sorting by date
      enableGrouping: true, // Enable grouping by Date Added
      getGroupingValue: (item: FilesystemItem) => {
        // Use item directly
        const dateValue =
          item.type === "document" ? item.uploadedAt : item.createdAt;
        if (!dateValue) return "Unknown Date";

        let date: Date;
        // Check if date is Firebase Timestamp or ISO string
        if (dateValue instanceof Timestamp) {
          date = dateValue.toDate();
        } else if (typeof dateValue === "string") {
          try {
            date = parseISO(dateValue);
          } catch (e) {
            console.error("Error parsing date string:", dateValue, e);
            return "Invalid Date Format"; // More specific error
          }
        } else {
          return "Unknown Date Type"; // Handle other potential types
        }

        if (isNaN(date.getTime())) {
          // Check if date is valid after parsing
          return "Invalid Date Value"; // More specific error
        }

        const now = new Date();
        if (isToday(date)) return "Today";
        if (isYesterday(date)) return "Yesterday";
        if (isThisWeek(date, { weekStartsOn: 1 })) return "This Week"; // Assuming week starts on Monday
        if (isThisMonth(date)) return "This Month";
        return format(date, "yyyy-MM"); // Return date as 'YYYY-MM' string
      },
      meta: {
        className: "w-1/5 sm:w-auto", // Narrow Date Added column to 20% on mobile
      },
      enableHiding: true, // Allow hiding this column
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-0 sm:-ml-4"
        >
          Date Modified
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }: { row: Row<FilesystemItem> }) => {
        const item = row.original;
        if (!item.updatedAt)
          return <span className="text-sm text-muted-foreground">-</span>;

        let dateString: string;
        // Check if updatedAt is Firebase Timestamp or ISO string
        if (item.updatedAt instanceof Timestamp) {
          dateString = formatDistanceToNow(item.updatedAt.toDate(), {
            addSuffix: true,
          });
        } else if (typeof item.updatedAt === "string") {
          try {
            dateString = formatDistanceToNow(parseISO(item.updatedAt), {
              addSuffix: true,
            });
          } catch {
            dateString = "Invalid Date";
          }
        } else {
          dateString = "-";
        }

        return (
          <span className="text-sm text-muted-foreground">{dateString}</span>
        );
      },
      enableGrouping: true, // Enable grouping by Date
      getGroupingValue: (item: FilesystemItem) => {
        // Use item directly
        if (!item.updatedAt) return "Unknown Date";

        let date: Date;
        // Check if updatedAt is Firebase Timestamp or ISO string
        if (item.updatedAt instanceof Timestamp) {
          date = item.updatedAt.toDate();
        } else if (typeof item.updatedAt === "string") {
          try {
            date = parseISO(item.updatedAt);
          } catch (e) {
            console.error("Error parsing date string:", item.updatedAt, e);
            return "Invalid Date Format"; // More specific error
          }
        } else {
          return "Unknown Date Type"; // Handle other potential types
        }

        if (isNaN(date.getTime())) {
          // Check if date is valid after parsing
          return "Invalid Date Value"; // More specific error
        }

        const now = new Date();
        if (isToday(date)) return "Today";
        if (isYesterday(date)) return "Yesterday";
        if (isThisWeek(date, { weekStartsOn: 1 })) return "This Week"; // Assuming week starts on Monday
        if (isThisMonth(date)) return "This Month";
        // Example: Group by year for older dates
        return format(date, "yyyy"); // Or 'Older', or 'yyyy-MM' for monthly grouping
      }, // End of getGroupingValue function
      enableSorting: true, // Ensure sorting is also enabled if needed
      enableHiding: true, // Allow hiding this column
      meta: {
        className: "w-1/4 sm:w-auto", // Narrow Date Modified column to 25% on mobile
      },
    },

    {
      id: "actions",
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
                {item.type === "folder" ? (
                  <DropdownMenuItem
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onRenameFolder(item.id, item.name);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onSelectItem(item);
                    }}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onMoveClick(item.id, item.name, item.type);
                  }}
                >
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
                <DropdownMenuItem
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    handleToggleFavorite(item.id, favoriteIds.has(item.id));
                  }}
                  disabled={togglingFavoriteId === item.id} // Disable while toggling this item
                >
                  <Star
                    className={`mr-2 h-4 w-4 ${
                      favoriteIds.has(item.id)
                        ? "fill-current text-yellow-400"
                        : ""
                    }`}
                  />
                  {togglingFavoriteId === item.id
                    ? "Updating..."
                    : favoriteIds.has(item.id)
                    ? "Remove from Favorites"
                    : "Add to Favorites"}
                </DropdownMenuItem>
                {/* --- Add Share Item Here --- */}
                {item.type === "document" && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent click-through
                      // Delay opening the dialog to avoid focus conflicts
                      setTimeout(() => {
                        onOpenShareDialog({ id: item.id, name: item.name });
                      }, 100); // 100ms delay
                    }}
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </DropdownMenuItem>
                )}
                {/* --- End Share Item --- */}
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
  grouping, // State from DashboardPage
  onGroupingChange, // Handler from DashboardPage
  columnVisibility, // State from DashboardPage
  onColumnVisibilityChange, // Handler from DashboardPage
  onMoveRow,
  onDropItemIntoFolder,
  favoriteIds,
  handleToggleFavorite,
  togglingFavoriteId,
  onOpenShareDialog, // Add the missing prop
  mobileViewColumn,
  onToggleMobileViewColumn,
}: DocumentTableProps) {
  const [itemToDelete, setItemToDelete] = useState<FilesystemItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null); // Track ID during async delete

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState({});
  const [expanded, setExpanded] = useState<ExpandedState>({});
  // Replace pagination with itemsToShow state for "Load More" functionality
  const [itemsToShow, setItemsToShow] = useState<number>(20);

  // Touch handling state
  const [touchStartTime, setTouchStartTime] = useState<number>(0);
  const [touchStartPosition, setTouchStartPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isTouchMoved, setIsTouchMoved] = useState<boolean>(false);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640); // Tailwind sm breakpoint
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  // Use useMemo to calculate hasMoreItems and slicedData to prevent infinite updates
  const { hasMoreItems, slicedData } = useMemo(() => {
    const dataArray = data ?? [];
    return {
      hasMoreItems: dataArray.length > itemsToShow,
      slicedData: dataArray.slice(0, itemsToShow),
    };
  }, [data, itemsToShow]);
  const { toast } = useToast();
  const functionsInstance = getFunctions(app); // Get Functions instance

  // Define columns using the factory function
  const columns = useMemo(
    () =>
      createColumns(
        onSelectItem,
        onFolderClick,
        onMoveClick,
        onRenameFolder,
        onDeleteFolder,
        (item, e) => {
          // handleDeleteClick implementation
          e.stopPropagation(); // Prevent row selection
          setItemToDelete(item);
        },
        isDeleting,
        deletingId, // Pass deletingId for visual feedback
        favoriteIds,
        handleToggleFavorite,
        togglingFavoriteId,
        onOpenShareDialog, // Pass the handler
        isMobile,
        setActiveRowId
      ),
    [
      onSelectItem,
      onFolderClick,
      onMoveClick,
      onRenameFolder,
      onDeleteFolder,
      isDeleting,
      deletingId,
      favoriteIds,
      handleToggleFavorite,
      togglingFavoriteId,
      onOpenShareDialog,
      isMobile,
    ]
  );

  // Helper to get the appropriate icon based on file type
  const getFileIcon = (
    fileName: string,
    mimeType?: string
  ): React.ReactNode => {
    if (!fileName) return <File className="h-4 w-4 text-gray-500" />;

    const extension = fileName.split(".").pop()?.toLowerCase() || "";

    // Define extension arrays with explicit types
    const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp"] as const;
    const documentExtensions = ["doc", "docx", "txt", "rtf"] as const;
    const archiveExtensions = ["zip", "rar", "tar", "gz"] as const;
    const spreadsheetExtensions = ["xlsx", "xls", "csv"] as const;

    // Check for spreadsheet files
    if (
      mimeType?.includes("spreadsheet") ||
      spreadsheetExtensions.some((ext) => ext === extension)
    ) {
      return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
    }
    // Check for PDF files
    else if (mimeType?.includes("pdf") || extension === "pdf") {
      return <FileText className="h-4 w-4 text-red-500" />;
    }
    // Check for image files
    else if (
      mimeType?.includes("image") ||
      imageExtensions.some((ext) => ext === extension)
    ) {
      return <FileImage className="h-4 w-4 text-purple-500" />;
    }
    // Check for document files
    else if (documentExtensions.some((ext) => ext === extension)) {
      return <FileText className="h-4 w-4 text-blue-600" />;
    }
    // Check for archive files
    else if (archiveExtensions.some((ext) => ext === extension)) {
      return <FileArchive className="h-4 w-4 text-orange-500" />;
    }

    // Default file icon
    return <File className="h-4 w-4 text-gray-500" />;
  };

  // Helper function to format dates safely
  const formatDate = (dateValue: any): string => {
    if (!dateValue) return "N/A";
    try {
      // Handle Firebase Timestamp objects
      if (dateValue.toDate && typeof dateValue.toDate === "function") {
        return dateValue.toDate().toLocaleDateString();
      }
      // Handle regular Date objects or strings
      return new Date(dateValue).toLocaleDateString();
    } catch (e) {
      return "N/A";
    }
  };

  // Helper function to check favorite status safely
  const checkIsFavorite = (itemId: string): boolean => {
    if (favoriteIds === null || favoriteIds === undefined) {
      return false;
    }
    if (favoriteIds instanceof Set) {
      return favoriteIds.has(itemId);
    }
    if (Array.isArray(favoriteIds)) {
      return (favoriteIds as string[]).includes(itemId); // Use type assertion if narrowing still fails
    }
    return false;
  };

  const table = useReactTable({
    // Use the pre-calculated sliced data
    data: slicedData,
    columns,
    getRowId: (originalRow) => originalRow.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    // No longer using pagination model
    // getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onColumnVisibilityChange: onColumnVisibilityChange, // Use prop handler
    onRowSelectionChange: setRowSelection,
    onGroupingChange: onGroupingChange, // Use prop handler
    onExpandedChange: setExpanded,
    // No longer using pagination
    // onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      columnVisibility, // Use prop state
      rowSelection,
      grouping, // Use prop state
      expanded,
      // Using manual slicing instead of pagination
      // pagination,
    },
  });

  // Handler for clicking a row (selects or navigates)
  const handleRowClick = (row: Row<FilesystemItem>) => {
    const item = row.original; // Get the item data from the row
    if (item.type === "folder") {
      onFolderClick(item.id, item.name);
    } else {
      onSelectItem(item);
      if (isMobile) {
        // Do not toggle row selection to avoid checking delete box
      }
    }
  };

  // Touch event handlers to distinguish between scrolling and tapping
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartTime(Date.now());
    setTouchStartPosition({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    });
    setIsTouchMoved(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosition) return;

    const deltaX = Math.abs(e.touches[0].clientX - touchStartPosition.x);
    const deltaY = Math.abs(e.touches[0].clientY - touchStartPosition.y);

    // If the touch has moved more than 10px in any direction, consider it a scroll
    if (deltaX > 10 || deltaY > 10) {
      setIsTouchMoved(true);
    }
  };

  const handleTouchEnd =
    (row: Row<FilesystemItem>) => (e: React.TouchEvent) => {
      const touchDuration = Date.now() - touchStartTime;

      // Trigger selection only on quick taps not moved and not on controls
      if (touchDuration < 300 && !isTouchMoved) {
        const target = e.target as HTMLElement;
        // ignore taps on inputs, buttons, links, or labels
        if (!target.closest("input, button, a, label")) {
          handleRowClick(row);
        }
      }

      // Reset touch state
      setTouchStartPosition(null);
    };

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center space-x-4">
            <Skeleton height={20} width={20} />
            <Skeleton height={20} width={200} />
            <Skeleton height={20} width={100} />
            <Skeleton height={20} width={80} />
            <Skeleton height={20} width={150} />
            <Skeleton height={20} width={150} />
            <Skeleton height={20} width={60} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-red-500 p-4">Error loading items: {error}</p>;
  }

  // Selected rows count and bulk delete logic
  const selectedCount = table.getSelectedRowModel().rows.length;

  const handleBulkDelete = async () => {
    const selectedRows = table.getSelectedRowModel().rows;
    const docIds = selectedRows
      .filter((r) => r.original.type === "document")
      .map((r) => r.original.id);
    if (docIds.length === 0) return;
    if (
      !window.confirm(
        `Delete ${docIds.length} file${
          docIds.length > 1 ? "s" : ""
        }? This cannot be undone.`
      )
    ) {
      return;
    }
    setIsDeleting(true);
    try {
      for (const id of docIds) {
        await onDeleteDocument(id);
      }
      table.resetRowSelection();
      toast({
        title: `Deleted ${docIds.length} file${docIds.length > 1 ? "s" : ""}`,
      });
    } catch (err: any) {
      toast({
        title: "Error deleting files",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Table Toolbar with Column Toggle - Reduced spacing */}
      <div className="flex items-center justify-between py-1 px-1 mb-1">
        <div className="flex flex-1 items-center space-x-2">
          {/* Filter Input */}
          <Input
            placeholder="Filter items..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
              table.getColumn("name")?.setFilterValue(event.target.value)
            }
            className="h-8 max-w-sm dark:border-gray-600" // Adjusted height and dark mode border override
          />
          {/* Toggle View Column button (mobile only) */}
          {isMobile && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={onToggleMobileViewColumn}
            >
              {(() => {
                const labelMap = {
                  none: "None",
                  uploadedAt: "Date Added",
                  updatedAt: "Date Modified",
                  size: "Size",
                  type: "Type",
                } as const;
                return `Show: ${labelMap[mobileViewColumn]}`;
              })()}
              <RefreshCw className="ml-1 h-3 w-3" />
            </Button>
          )}
          {/* Columns Dropdown (hidden on mobile) */}
          {!isMobile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* Using SlidersHorizontal icon */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-dashed"
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                  .getAllLeafColumns() // Use leaf columns for toggling
                  .filter((column) => column.getCanHide()) // Filter by columns that can be hidden
                  .map((column) => {
                    // Determine a user-friendly display name
                    const displayName =
                      column.id === "name"
                        ? "Name"
                        : column.id === "type"
                        ? "Type"
                        : column.id === "size"
                        ? "Size"
                        : column.id === "uploadedAt"
                        ? "Date Added"
                        : column.id === "updatedAt"
                        ? "Date Modified"
                        : column.id; // Fallback to id

                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={
                          (value) => column.toggleVisibility(!!value) // Correctly use toggleVisibility
                        }
                      >
                        {displayName}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Shadcn Table - Single scrollable container */}
      <div className="rounded-md border flex-grow overflow-x-hidden">
        <div className="w-full md:overflow-x-auto">
          {/* Allow horizontal scroll only on md+ */}{" "}
          {/* Add overflow-x-auto here */}
          <ShadcnTable className="w-full table-fixed">
            {/* Fixed header */}
            <TableHeader className="sticky top-0 bg-background z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        (
                          header.column.columnDef.meta as {
                            className?: string;
                          }
                        )?.className
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            {/* Table body - no longer needs its own scroll */}
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row: Row<FilesystemItem>) => {
                  // Check if the row is a grouping row
                  if (row.getIsGrouped()) {
                    return (
                      <TableRow key={row.id}>
                        <TableCell
                          colSpan={row.getVisibleCells().length}
                          className="font-medium bg-muted/50"
                        >
                          <div className="flex items-center space-x-2">
                            <button
                              {...{
                                onClick: row.getToggleExpandedHandler(),
                                style: { cursor: "pointer" },
                              }}
                            >
                              {row.getIsExpanded() ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            {/* Render the grouping cell content */}
                            {row.groupingColumnId === "uploadedAt"
                              ? (() => {
                                  // Handle special date strings first
                                  const specialDateValues = [
                                    "Today",
                                    "Yesterday",
                                    "This Week",
                                    "This Month",
                                    "Unknown Date",
                                  ];
                                  const dateStr = String(row.groupingValue);

                                  // If it's a special date string, return it directly
                                  if (specialDateValues.includes(dateStr)) {
                                    return dateStr;
                                  }

                                  // Otherwise try to parse it as a yyyy-MM format
                                  try {
                                    // Only attempt to parse if it matches yyyy-MM pattern
                                    if (/^\d{4}-\d{2}$/.test(dateStr)) {
                                      const parsedDate = parse(
                                        dateStr,
                                        "yyyy-MM",
                                        new Date()
                                      );
                                      if (isValid(parsedDate)) {
                                        return format(parsedDate, "MMMM yyyy");
                                      }
                                    }
                                    // If we get here, it's not a valid yyyy-MM string
                                    return dateStr; // Just return the original string
                                  } catch (error) {
                                    console.error(
                                      `Error formatting date group value: ${dateStr}`,
                                      error
                                    );
                                    return dateStr; // Return original on error
                                  }
                                })()
                              : flexRender(
                                  // @ts-ignore // Accessing internal group cell might need ts-ignore
                                  row.getVisibleCells()[0].column.columnDef
                                    .cell,
                                  row.getVisibleCells()[0].getContext()
                                )}
                            <span className="text-xs text-muted-foreground">
                              ({row.subRows.length})
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  // Render normal data row (only if expanded or not part of a group)
                  if (
                    !row.getIsGrouped() &&
                    (row.depth === 0 || row.getParentRow()?.getIsExpanded())
                  ) {
                    return (
                      <DraggableRow
                        key={row.id}
                        row={row}
                        onMoveRow={onMoveRow}
                        onDropItemIntoFolder={onDropItemIntoFolder}
                      >
                        {/* Desktop view - standard table cells */}
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className={cn(
                              "py-2", // Keep padding, remove hidden sm:table-cell
                              cell.column.id === "select" &&
                                "pl-0 pr-1 sm:px-2 w-[28px] min-w-[28px] max-w-[28px]",
                              cell.column.id === "name" && "px-0 sm:px-4",
                              (
                                cell.column.columnDef.meta as {
                                  className?: string;
                                }
                              )?.className,
                              {
                                "cursor-pointer hover:bg-muted/50":
                                  cell.column.id !== "actions" &&
                                  cell.column.id !== "select",
                              },
                              {
                                "bg-blue-50 dark:bg-blue-900/50":
                                  !row.getIsSelected() &&
                                  activeRowId === row.original.id,
                              }
                            )}
                            onClick={(e) => {
                              // Only handle click events on desktop
                              if (
                                window.matchMedia("(min-width: 768px)")
                                  .matches &&
                                cell.column.id !== "actions" &&
                                cell.column.id !== "select"
                              ) {
                                handleRowClick(row);
                              }
                            }}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={
                              cell.column.id !== "actions" &&
                              cell.column.id !== "select"
                                ? handleTouchEnd(row)
                                : undefined
                            }
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                      </DraggableRow>
                    );
                  }

                  return null; // Don't render hidden sub-rows
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No documents or folders found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </ShadcnTable>
        </div>
        {/* Extra padding when all items are loaded */}
        {!hasMoreItems && <div className="pb-8" />}
      </div>

      {/* Load More Button - Fixed at bottom for mobile */}
      {hasMoreItems && (
        <div className="fixed bottom-0 left-0 right-0 flex justify-center py-3 bg-background/90 backdrop-blur-sm border-t z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setItemsToShow((prev) => prev + 20)}
            className="w-40"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Load More
          </Button>
        </div>
      )}

      {/* Bulk Delete Bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-background border shadow-lg rounded-md px-4 py-2 flex items-center gap-3 z-20">
          <span className="text-sm">{selectedCount} selected</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleBulkDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={itemToDelete !== null}
        onOpenChange={(open: boolean) => !open && setItemToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the{" "}
              {itemToDelete?.type === "folder" ? "folder" : "document"}{" "}
              <span className="font-medium">'{itemToDelete?.name}'</span>.
              {itemToDelete?.type === "folder" &&
                " All contents within this folder will also be deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setItemToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                // Make async for potential await
                if (!itemToDelete) return;

                setDeletingId(itemToDelete.id); // Set ID for visual feedback
                setIsDeleting(true);

                try {
                  if (itemToDelete.type === "document") {
                    await onDeleteDocument(itemToDelete.id); // Await the prop function
                    toast({
                      title: "Success",
                      description: `Document '${itemToDelete.name}' deleted.`,
                    });
                  } else if (itemToDelete.type === "folder") {
                    const deleteFolderFunction = httpsCallable(
                      functionsInstance,
                      "deleteFolder"
                    );
                    const result = await deleteFolderFunction({
                      folderId: itemToDelete.id,
                    });
                    const responseData = result.data as {
                      success: boolean;
                      message?: string;
                    };
                    if (responseData.success) {
                      toast({
                        title: "Success",
                        description: `Folder '${itemToDelete.name}' and its contents deleted successfully.`,
                      });
                    } else {
                      throw new Error(
                        responseData.message || "Unknown error from function."
                      );
                    }
                  }
                } catch (error: unknown) {
                  console.error(
                    `Error deleting ${itemToDelete.type} ${itemToDelete.id}:`,
                    error
                  );
                  const message =
                    error instanceof Error
                      ? error.message
                      : "An unknown error occurred.";
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: `Failed to delete ${itemToDelete.type} '${itemToDelete.name}'. ${message}`,
                  });
                } finally {
                  setIsDeleting(false);
                  setDeletingId(null); // Clear deleting ID
                  setItemToDelete(null); // Close dialog
                }
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
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
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  // Get the query parameter if passed from the AI search component
  const transactionQuery = searchParams.get('query');
  const [documents, setDocuments] = useState<MyDocumentData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [filesystemItems, setFilesystemItems] = useState<FilesystemItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<BreadcrumbItem[]>([]);
  const [selectedDocument, setSelectedDocument] =
    useState<MyDocumentData | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isViewerVisible, setIsViewerVisible] = useState(true);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const [folderToRename, setFolderToRename] = useState<{
    id: string;
    currentName: string;
  } | null>(null);
  const [newRenameFolderName, setNewRenameFolderName] = useState("");
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [movingDocument, setMovingDocument] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [availableFolders, setAvailableFolders] = useState<FolderData[]>([]);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [groupingOption, setGroupingOption] = useState<
    "none" | "type" | "date"
  >("none"); // Control grouping UI

  const panelGroupRef = useRef<any>(null);
  const shouldRefreshAfterUpload = useRef(false);

  async function fetchItems(folderId: string | null = null) {
    // Use the provided folderId or fall back to the current state
    // Handle null explicitly to avoid confusion
    const targetFolderId = folderId !== undefined ? folderId : currentFolderId;
    console.log(
      `[fetchItems] Using targetFolderId:`,
      targetFolderId,
      "from input:",
      folderId,
      "current state:",
      currentFolderId
    );

    if (authLoading) {
      console.log("Auth is loading, skipping fetch.");
      return;
    }
    if (!user) {
      console.log("User not logged in, redirecting.");
      router.push("/login");
      return;
    }

    console.log(
      `Fetching items for user: ${user.uid}, folderId: ${targetFolderId}`
    );
    setLoadingDocs(true);
    setDocsError(null);
    setFilesystemItems([]);

    try {
      const userId = user.uid;

      // Query for folders in the current folder
      const foldersQuery = query(
        collection(db, "users", userId, "folders"),
        where("parentFolderId", "==", targetFolderId),
        orderBy("name", "asc")
      );
      console.log(
        `[fetchItems] Querying folders with parentFolderId: ${targetFolderId}`
      );
      const folderSnapshot = await getDocs(foldersQuery);
      const fetchedFolders: FolderData[] = folderSnapshot.docs.map((doc) => {
        const data = doc.data() as Omit<FolderData, "id">;
        return { id: doc.id, ...data };
      });
      const folderItems: FilesystemItem[] = fetchedFolders.map((f) => ({
        ...f,
        type: "folder",
      }));
      console.log(
        "Fetched Folders:",
        fetchedFolders.map((f) => ({
          id: f.id,
          name: f.name,
          parentFolderId: f.parentFolderId,
        }))
      );

      // Fetch documents in the current folder (no ordering to avoid index issues)
      const documentsQuery = query(
        collection(db, "users", userId, "documents"),
        where("folderId", "==", targetFolderId)
      );
      const documentSnapshot = await getDocs(documentsQuery);

      console.log(
        `[Dashboard] Document query complete for folderId: ${targetFolderId}, found: ${documentSnapshot.docs.length} documents`
      );

      const fetchedDocs: MyDocumentData[] = documentSnapshot.docs.map((doc) => {
        const data = doc.data();
        // Explicitly construct the object matching MyDocumentData
        // Handle potential null for createdAt directly
        const docData: MyDocumentData = {
          id: doc.id,
          userId: data.userId,
          name: data.name || data.fileName || doc.id, // Fallback to fileName or doc ID
          storagePath: data.storagePath,
          folderId: data.folderId ?? null,
          uploadedAt: data.uploadedAt as Timestamp,
          updatedAt: data.updatedAt as Timestamp,
          contentType: data.contentType,
          status: data.status,
          downloadURL: data.downloadURL,
          size: data.size,
          // Ensure createdAt conforms to 'Timestamp | undefined' expected by MyDocumentData
          createdAt: data.createdAt ? (data.createdAt as Timestamp) : undefined,
          parentId: data.parentId,
        };
        return docData;
      });

      // Map fetched documents to FilesystemItem, ensuring correct type assignment
      const documentItems: FilesystemItem[] = fetchedDocs.map((d) => {
        const item: FilesystemItem = {
          ...d,
          // Convert null createdAt to undefined here to match FilesystemItem
          createdAt: d.createdAt ?? undefined,
          type: "document", // Explicitly set type
        };
        return item;
      });

      console.log(
        `[Dashboard] Processed ${fetchedDocs.length} documents into UI items`
      );

      // Sort folders alphabetically, then documents by newest first
      const sortedFolders = [...folderItems].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
      const sortedDocs = [...documentItems].sort((a, b) => {
        const aTime = a.createdAt?.toMillis() || a.updatedAt?.toMillis() || 0;
        const bTime = b.createdAt?.toMillis() || b.updatedAt?.toMillis() || 0;
        return bTime - aTime;
      });
      const combinedItems: FilesystemItem[] = [...sortedFolders, ...sortedDocs];

      setFilesystemItems(combinedItems);
      console.log(
        `[Dashboard] Updated UI with ${combinedItems.length} total items (folders first, then sorted by name)`
      );
    } catch (error) {
      console.error("[Dashboard] Error fetching documents or folders:", error);
      setDocsError(
        `Failed to load items: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setLoadingDocs(false);
    }
  }

  const handleSelectDocument = (doc: MyDocumentData | null) => {
    console.log("Document selected:", doc);
    setSelectedDocument(doc);
    if (doc && !isViewerVisible) {
      setIsViewerVisible(true);
    }
  };

  const handleSelectItem = (item: FilesystemItem | null) => {
    console.log("Item selected:", item);
    if (item?.type === "document") {
      // Navigate to the document chat page when a document is selected
      console.log("Navigating to document chat page for:", item.id);
      router.push(`/document-chat/${item.id}`);
    } else if (item?.type === "folder") {
      console.log("Folder selected (for info):", item);
      setSelectedDocument(null);
    } else {
      handleSelectDocument(null);
    }
  };

  const handleFolderClick = useCallback(
    (folderId: string, folderName: string) => {
      console.log(`Navigating into folder: ${folderName} (${folderId})`);
      setCurrentFolderId(folderId);
      setFolderPath((prev) => [...prev, { id: folderId, name: folderName }]);
      setSelectedDocument(null);
    },
    [setCurrentFolderId, setFolderPath]
  );

  const handleNavigate = useCallback(
    (folderId: string | null) => {
      setSelectedDocument(null); // Deselect document when navigating
      if (folderId === null) {
        router.push("/dashboard"); // Navigate to root using router
      } else {
        router.push(`/dashboard?folderId=${folderId}`); // Navigate to specific folder using router
      }
    },
    [router]
  );

  const handleBreadcrumbNavigate = useCallback(
    (folderId: string) => {
      console.log(`Updating internal state for folder: ${folderId}`);
      if (folderId === "root") {
        setFolderPath([]);
        setCurrentFolderId(null);
        setSelectedDocument(null);
      } else {
        const folderIndex = folderPath.findIndex(
          (item) => item.id === folderId
        );
        if (folderIndex !== -1) {
          setFolderPath(folderPath.slice(0, folderIndex + 1));
          setCurrentFolderId(folderId);
          setSelectedDocument(null);
        }
      }
    },
    [folderPath, setCurrentFolderId, setFolderPath]
  );

  // Upload success handler with improved focus management
  const handleUploadSuccess = useCallback(() => {
    // Mark that we should refresh after the dialog fully closes
    shouldRefreshAfterUpload.current = true;
    // Close the dialog (focus will be handled by Radix)
    setIsUploadDialogOpen(false);
  }, []);

  const handleDeleteDocument = async (docId: string) => {
    if (!user) {
      console.error("No user available for deleting document");
      throw new Error("Authentication required");
    }

    let token: string | null = null;
    try {
      token = await user.getIdToken();
    } catch (tokenError) {
      console.error("Failed to get ID token for delete operation", tokenError);
      throw new Error("Authentication error. Please refresh and try again.");
    }

    console.log(`Attempting to delete document with ID: ${docId}`);

    const response = await fetch(`/api/documents?id=${docId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log("Delete API Response Status:", response.status);

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to parse error response" }));
      console.error("Delete API Error Response:", errorData);
      throw new Error(
        errorData.message ||
          `Failed to delete document. Status: ${response.status}`
      );
    }

    console.log("Document deleted successfully via API.");
    toast({ title: "Success", description: "Document deleted successfully." });

    await triggerRefresh();
  };

  const handleCreateFolder = async () => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in to create a folder.",
      });
      return;
    }
    if (!newFolderName.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Folder name cannot be empty.",
      });
      return;
    }

    setIsCreatingFolder(true);
    try {
      const createFolderFunction = httpsCallable(
        getFunctions(app),
        "createFolder"
      );
      await createFolderFunction({
        name: newFolderName.trim(),
        parentFolderId: currentFolderId,
      });
      toast({
        title: "Folder created",
        description: `Folder "${newFolderName.trim()}" created successfully.`,
      });
      setShowCreateFolderDialog(false);
      setNewFolderName("");
      triggerRefresh();
    } catch (error) {
      console.error("Error creating folder:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to create folder: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
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
      const q = query(foldersRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedFolders: FolderData[] = querySnapshot.docs.map((doc) => {
        const data = doc.data() as Omit<FolderData, "id">;
        return { id: doc.id, ...data };
      });
      setAvailableFolders(fetchedFolders);
    } catch (error) {
      console.error("Error fetching all folders:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not load folders for moving.",
      });
      setAvailableFolders([]);
    } finally {
      setIsLoadingFolders(false);
    }
  }

  const handleOpenMoveModal = (
    itemId: string,
    itemName: string,
    itemType: "document" | "folder"
  ) => {
    if (availableFolders.length === 0) {
      fetchAllFolders();
    }
    setMovingDocument({ id: itemId, name: itemName });
    setIsMoveModalOpen(true);
  };

  const handleMoveConfirm = useCallback(
    async (targetFolderId: string | null) => {
      if (!movingDocument) return;

      console.log(
        `Attempting to move ${movingDocument.id} to ${targetFolderId}`
      );
      try {
        const moveDocFunc = httpsCallable(getFunctions(app), "moveDocument");
        await moveDocFunc({
          documentId: movingDocument.id,
          targetFolderId: targetFolderId,
        });
        setIsMoveModalOpen(false);
        setMovingDocument(null);
        toast({
          title: "Success",
          description: `Moved '${movingDocument.name}' successfully.`,
        });
        fetchAllFolders();
        fetchItems(currentFolderId);
      } catch (error: any) {
        console.error("Error moving document:", error);
        const message =
          error?.details?.message ||
          error?.message ||
          "An unknown error occurred";
        toast({
          variant: "destructive",
          title: "Error Moving Document",
          description: `Failed to move document: ${message}`,
        });
      }
    },
    [
      movingDocument,
      getFunctions(app),
      toast,
      currentFolderId,
      setIsMoveModalOpen,
      setMovingDocument,
    ]
  );

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
      >(getFunctions(app), "renameFolder");

      const result = await renameFolderFunction({
        folderId: id,
        newName: trimmedNewName,
      });

      const responseData = result.data as {
        success: boolean;
        message?: string;
      };

      if (responseData.success) {
        toast({
          title: "Success",
          description: `Folder renamed to '${trimmedNewName}' successfully.`,
        });

        setFolders((prev) =>
          prev.map((folder) =>
            folder.id === id ? { ...folder, name: trimmedNewName } : folder
          )
        );

        if (currentFolderId === id) {
          setFolderPath((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, name: trimmedNewName } : item
            )
          );
        }

        triggerRefresh();
      } else {
        throw new Error(responseData.message || "Unknown error occurred");
      }
    } catch (error) {
      console.error(`Error renaming folder ${id}:`, error);
      const message =
        error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to rename folder: ${message}`,
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

  const handleGroupingChange = (value: string) => {
    setGroupingOption(value as "type" | "date" | "none");
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
    console.log(
      `Moved item from index ${dragIndex} to ${hoverIndex} in local state.`
    );
  }, []); // Use useCallback to prevent unnecessary re-renders

  const handleDropItemIntoFolder = useCallback(
    async (itemId: string, targetFolderId: string) => {
      console.log(
        `Attempting to move item ${itemId} into folder ${targetFolderId}`
      );
      const itemToMove = filesystemItems.find((item) => item.id === itemId);

      if (!itemToMove) {
        toast({
          variant: "destructive",
          title: "Error moving item",
          description: "Could not find the item to move.",
        });
        return;
      }

      const collectionName =
        itemToMove.type === "folder" ? "folders" : "documents";
      const itemRef = doc(db, collectionName, itemId);

      try {
        await updateDoc(itemRef, {
          parentId: targetFolderId,
          updatedAt: Timestamp.now(),
        });

        // Optimistically remove the item from the current view
        setFilesystemItems((prevItems) =>
          prevItems.filter((item) => item.id !== itemId)
        );

        toast({
          title: `Successfully moved ${itemToMove.type}`,
          description: `Moved '${itemToMove.name}' into target folder.`,
        });
        console.log(
          `Successfully moved item ${itemId} to folder ${targetFolderId} in Firestore.`
        );
        // Optionally, trigger a re-fetch or navigate if needed
      } catch (error) {
        console.error("Error moving item into folder:", error);
        toast({
          variant: "destructive",
          title: "Error Moving Item",
          description: "Failed to update the item in the database.",
        });
      }
    },
    [filesystemItems]
  ); // Effect to fetch items when the current folder changes
  useEffect(() => {
    if (authLoading) {
      console.log("Auth is loading, skipping fetch.");
      return;
    }
    if (!user) {
      console.log("User not logged in, redirecting.");
      router.push("/login");
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
    console.log(
      "[DashboardPage] Current folder ID before change:",
      currentFolderId
    );

    // Don't do anything if we're already in this folder
    if (folderId === currentFolderId) {
      console.log(
        "[DashboardPage] Already in this folder, no navigation needed"
      );
      return;
    }

    // Update state
    setCurrentFolderId(folderId);
    setSelectedDocument(null); // Clear selection when changing folders

    // Force an immediate fetch without waiting for the effect
    const userId = user?.uid;
    if (!userId) return;

    console.log(
      "[DashboardPage] Manually fetching items for folder:",
      folderId
    );
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

  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  useEffect(() => {
    setInitialLoadComplete(true);
  }, []);

  if (authLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>Loading...</div>;
  }

  const allFolders = useMemo(() => {
    return filesystemItems.filter(
      (item) => item.type === "folder"
    ) as FolderData[];
  }, [filesystemItems]);

  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!user || !initialLoadComplete) return; // Wait for user and initial items load

    setLoadingFavorites(true);
    const favoritesDocRef = doc(db, "userFavorites", user.uid);

    getDoc(favoritesDocRef)
      .then((docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFavoriteIds(new Set(data.favoritedItemIds || []));
        } else {
          // Document doesn't exist, user has no favorites yet
          setFavoriteIds(new Set());
        }
      })
      .catch((error) => {
        console.error("Error fetching favorites:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load your favorites.",
        });
        setFavoriteIds(new Set()); // Reset on error
      })
      .finally(() => {
        setLoadingFavorites(false);
      });
  }, [user, initialLoadComplete, refreshTrigger]); // Rerun if user changes or refresh triggered after initial load

  const handleToggleFavorite = async (
    itemId: string,
    currentStatus: boolean
  ) => {
    if (!user || togglingFavoriteId) return; // Prevent concurrent toggles

    setTogglingFavoriteId(itemId);
    const favoritesDocRef = doc(db, "userFavorites", user.uid);
    const operation = currentStatus ? arrayRemove(itemId) : arrayUnion(itemId);
    const successMessage = currentStatus
      ? "Removed from favorites"
      : "Added to favorites";
    const actionVerb = currentStatus ? "remove" : "add";

    try {
      const docSnap = await getDoc(favoritesDocRef);
      if (docSnap.exists()) {
        await updateDoc(favoritesDocRef, { favoritedItemIds: operation });
      } else if (!currentStatus) {
        // Only create the doc if we are adding the first favorite
        await setDoc(favoritesDocRef, { favoritedItemIds: [itemId] });
      } else {
        // Trying to remove from a non-existent doc, should not happen but handle gracefully
        console.warn(
          "Attempted to remove favorite from non-existent userFavorites doc"
        );
        throw new Error("Favorites record not found.");
      }

      // Update local state optimistically? Or after success?
      // Let's update after success for now
      setFavoriteIds((prev) => {
        const newSet = new Set(prev);
        if (currentStatus) {
          newSet.delete(itemId);
        } else {
          newSet.add(itemId);
        }
        return newSet;
      });

      toast({ title: "Success", description: successMessage });
    } catch (error) {
      console.error(`Error ${actionVerb}ing favorite ${itemId}:`, error);
      // Add type check for error
      const message = error instanceof Error ? error.message : String(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to ${actionVerb} favorite. ${message}`,
      });
    } finally {
      setTogglingFavoriteId(null);
    }
  };

  // Add state for grouping controlled by DashboardPage
  const [grouping, setGrouping] = useState<GroupingState>(
    groupingOption === "type"
      ? ["type"]
      : groupingOption === "date"
      ? ["uploadedAt"] // Assuming 'Date Added' corresponds to 'uploadedAt'
      : []
  );

  // Add state for column visibility controlled by DashboardPage
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    // Default visibility - Adjust as needed
    name: true,
    type: true,
    size: true,
    uploadedAt: true, // Corresponds to 'Date Added'
    updatedAt: true, // Corresponds to 'Date Modified'
    actions: true,
  });

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640); // sm breakpoint
    checkMobile(); // Initial check
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [mobileViewColumn, setMobileViewColumn] = useState<
    "none" | "uploadedAt" | "updatedAt" | "size" | "type"
  >("uploadedAt");

  useEffect(() => {
    let newVisibility: VisibilityState;
    if (isMobile) {
      newVisibility = {
        select: true,
        name: true,
        actions: true,
        uploadedAt: mobileViewColumn === "uploadedAt",
        updatedAt: mobileViewColumn === "updatedAt",
        size: mobileViewColumn === "size",
        type: mobileViewColumn === "type",
      };
    } else {
      // Desktop visibility
      newVisibility = {
        select: true,
        name: true,
        type: true,
        size: true,
        uploadedAt: true,
        updatedAt: true,
        actions: true,
      };
    }
    console.log(
      "[Effect] Setting columnVisibility based on isMobile:",
      isMobile,
      "mobileViewColumn:",
      mobileViewColumn,
      "to:",
      newVisibility
    );
    setColumnVisibility(newVisibility);
  }, [isMobile, mobileViewColumn]);

  console.log(
    "[Render] Passing columnVisibility to DataTable:",
    columnVisibility
  );

  useEffect(() => {
    setGrouping(
      groupingOption === "type"
        ? ["type"]
        : groupingOption === "date"
        ? ["uploadedAt"] // Ensure this matches the column accessor key
        : []
    );
  }, [groupingOption]);

  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [sharingDocument, setSharingDocument] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleOpenShareDialog = (doc: { id: string; name: string }) => {
    setSharingDocument(doc);
    setIsShareDialogOpen(true);
  };

  const handleCloseShareDialog = () => {
    setIsShareDialogOpen(false);
    setSharingDocument(null); // Clear immediately
  };

  const pathname = usePathname();

  useEffect(() => {
    if (isShareDialogOpen) {
      handleCloseShareDialog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]); // Dependency array includes pathname

  // Increment the refresh trigger to force re-fetching items
  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // Cleanup any lingering aria-hidden attributes after refresh to avoid focus traps
  useEffect(() => {
    const timer = setTimeout(() => {
      const hiddenEls = document.querySelectorAll(
        '[aria-hidden="true"][data-aria-hidden="true"]'
      );
      hiddenEls.forEach((el) => {
        // Only remove if no focused element is inside
        if (el instanceof HTMLElement && !el.contains(document.activeElement)) {
          el.removeAttribute("aria-hidden");
          el.removeAttribute("data-aria-hidden");
        }
      });
    }, 300); // run shortly after DOM mutations

    return () => clearTimeout(timer);
  }, [refreshTrigger]);

  return (
    <div className="flex h-screen flex-col bg-muted overflow-hidden">
      {/* Fixed header - Mobile optimized */}
      <header className="sticky top-0 z-40 flex h-9 items-center gap-2 sm:gap-4 bg-background px-2 sm:px-4 border-b border-border/40">
        <h1 className="text-xl font-semibold whitespace-nowrap">
          My Documents
        </h1>

        {/* Desktop navigation */}
        <div className="hidden sm:flex items-center gap-4">
          <Link
            href="/chat-history"
            className="text-base font-medium text-[var(--primary)] hover:underline"
          >
            Chat History
          </Link>
          {/* Add Prepaid Expenses Link for Desktop */}
          <Link
            href="/prepaid-expenses"
            className="text-base font-medium text-[var(--primary)] hover:underline ml-4"
          >
            Prepaid Expenses
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {/* Dark mode toggle */}
          <ThemeToggle />

          {/* Welcome message - Simplified on mobile */}
          <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline-block">
            Welcome, {user.displayName || user.email}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap sm:hidden">
            {user.displayName?.split(" ")[0] || user.email?.split("@")[0]}
          </span>

          {/* GL Codes Button */}
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs py-0 mr-2 hidden sm:flex items-center"
            onClick={() => router.push("/dashboard/gl-codes")}
          >
            <Database className="h-3 w-3 mr-1" />
            GL Codes
          </Button>
          
          {/* Desktop logout button */}
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs py-0 border-[var(--muted-foreground)] text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] hidden sm:flex"
            onClick={logout}
          >
            Logout
          </Button>

          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild className="sm:hidden">
              <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[200px] sm:w-[300px]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-4">
                <Link
                  href="/chat-history"
                  className="text-base font-medium hover:underline flex items-center gap-2"
                >
                  <FileText className="h-5 w-5" />
                  Chat History
                </Link>
                {/* Add Prepaid Expenses Link for Mobile */}
                <Link
                  href="/prepaid-expenses"
                  className="text-base font-medium hover:underline flex items-center gap-2"
                  onClick={() => {
                    // Add logic to close the sheet if needed, depending on Sheet component behavior
                  }}
                >
                  <Receipt className="h-5 w-5" />
                  Prepaid Expenses
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={logout}
                >
                  <XIcon className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              </div>
              {/* Mobile column selector */}
              <div className="pt-2 border-t border-border px-4">
                <p className="text-sm font-medium mb-2">Toggle View Column</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center"
                  onClick={() => {
                    const views: (
                      | "none"
                      | "uploadedAt"
                      | "updatedAt"
                      | "size"
                      | "type"
                    )[] = ["none", "uploadedAt", "updatedAt", "size", "type"];
                    const currentIndex = views.indexOf(mobileViewColumn);
                    const nextIndex = (currentIndex + 1) % views.length;
                    setMobileViewColumn(views[nextIndex]);
                  }}
                >
                  Show:{" "}
                  {
                    {
                      none: "None",
                      uploadedAt: "Date Added",
                      updatedAt: "Date Modified",
                      size: "Size",
                      type: "Type",
                    }[mobileViewColumn]
                  }
                  <RefreshCw className="ml-2 h-3 w-3" />
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-0 sm:p-0 overflow-hidden min-h-0">
        {/* Fixed breadcrumbs navigation */}
        <div className="sticky top-7 z-30 bg-muted/40 pt-0 pb-0 px-4 text-[10px] text-muted-foreground">
          <FolderBreadcrumbs
            currentFolderId={currentFolderId}
            folders={availableFolders}
            onNavigate={handleNavigateFolder}
          />
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-auto h-full min-h-0">
          {selectedDocument && (
            <>
              <div className="flex justify-end mb-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsMaximized((prev) => !prev)}
                  title={isMaximized ? "Exit full screen" : "Full screen"}
                >
                  {isMaximized ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsViewerVisible((prev) => !prev)}
                  title={
                    isViewerVisible
                      ? "Hide document viewer"
                      : "Show document viewer"
                  }
                >
                  {isViewerVisible ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Document Viewer and Chat Interface */}
              {isViewerVisible && (
                <div
                  className={`mb-4 h-[60vh] flex flex-col ${
                    // Added height and flex context
                    isMaximized && isViewerVisible ? "hidden" : ""
                  }`}
                >
                  <div className="flex-1 flex flex-row space-x-4 overflow-hidden">
                    {" "}
                    {/* Changed to flex-1 and added overflow */}
                    <div className="w-[70%] flex-shrink-0 overflow-auto">
                      {" "}
                      {/* Added overflow-auto */}
                      <DocumentViewer document={selectedDocument} />
                    </div>
                    <div className="w-[30%] flex-shrink-0 overflow-auto">
                      {" "}
                      {/* Added overflow-auto */}
                      <ChatInterface
                        chatId={selectedDocument.id} // Using doc ID as chat ID in this context
                        userId={user.uid} // Add required userId prop
                        linkedDocuments={[selectedDocument]} // Pass the selected doc as linkedDocuments
                        initialMessage={transactionQuery || undefined} // Handle null -> undefined conversion
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div
            className={`flex-1 flex flex-col overflow-hidden min-h-0 ${
              isMaximized && isViewerVisible ? "hidden" : ""
            }`}
          >
            {/* Favorites Section removed to simplify UI and reduce whitespace */}

            {/* Document List/Grid Section - Takes remaining space */}
            <div className="flex-1 overflow-auto px-1 pt-0 w-full min-h-0">
              {" "}
              {/* Container for document section */}
              {/* Document Management Toolbar */}
              <div className="mb-0 sm:mb-1">
                {" "}
                {/* Reduced margin-bottom */}
                <div className="flex items-center justify-between bg-muted/30 p-1.5 rounded-md mb-2">
                  {/* Left side - Primary Actions */}
                  <div className="flex items-center space-x-1.5">
                    {/* New Button with Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1.5" />
                          <span className="text-xs">New</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          onClick={() => setShowCreateFolderDialog(true)}
                        >
                          <FolderPlus className="h-4 w-4 mr-2" />
                          New Folder
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setIsUploadDialogOpen(true);
                          }}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Document
                        </DropdownMenuItem>
                        {/* Add New Chat Option */}
                        <DropdownMenuItem
                          onClick={() => {
                            const createAndNavigateToNewChat = async () => {
                              if (!user) {
                                toast({
                                  variant: "destructive",
                                  title: "Error",
                                  description:
                                    "You must be logged in to start a chat.",
                                });
                                return;
                              }

                              try {
                                // Create a new chat document in Firestore
                                const chatsCollectionRef = collection(
                                  db,
                                  "users",
                                  user.uid,
                                  "chats"
                                );
                                const newChatDocRef = await addDoc(
                                  chatsCollectionRef,
                                  {
                                    // Initial data for the new chat
                                    createdAt: serverTimestamp(),
                                    title: "New Chat", // Default title, user can rename later
                                    userId: user.uid,
                                    // No documentId initially
                                  }
                                );

                                console.log(
                                  "New chat created with ID:",
                                  newChatDocRef.id
                                );

                                // Navigate to the new chat page
                                router.push(`/chat/${newChatDocRef.id}`);
                              } catch (error) {
                                console.error(
                                  "Error creating new chat:",
                                  error
                                );
                                toast({
                                  variant: "destructive",
                                  title: "Error",
                                  description:
                                    "Failed to start a new chat. Please try again.",
                                });
                              }
                            };
                            createAndNavigateToNewChat();
                          }}
                        >
                          <MessageSquarePlus className="h-4 w-4 mr-2" />
                          New Chat
                        </DropdownMenuItem>
                        {/* GL Codes Management */}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            router.push("/dashboard/gl-codes");
                          }}
                        >
                          <Database className="h-4 w-4 mr-2" />
                          GL Codes Manager
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Refresh Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={triggerRefresh}
                      title="Refresh Documents"
                      className="h-7 w-7 p-0"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {/* Right side - View Controls */}
                  <div className="flex items-center space-x-1.5">
                    {/* Favorites Dialog Trigger Button - Now First */}
                    <FavoritesDialog
                      trigger={
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                        >
                          <Star className="h-3.5 w-3.5" />
                          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                            Favorites
                          </span>
                        </Button>
                      }
                      allItems={filesystemItems}
                      favoriteIds={favoriteIds}
                      onSelectItem={handleSelectItem}
                      onFolderClick={handleFolderClick}
                      handleToggleFavorite={handleToggleFavorite}
                      togglingFavoriteId={togglingFavoriteId}
                    />

                    {/* Grouping Control - Now Second */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 ml-2"
                          title={
                            groupingOption === "type"
                              ? "Group By Type"
                              : groupingOption === "date"
                              ? "Group By Date"
                              : "No Grouping"
                          }
                        >
                          <ListTree className="h-3.5 w-3.5 md:mr-1.5" />
                          <span className="text-xs hidden md:inline">
                            {groupingOption === "type"
                              ? "By Type"
                              : groupingOption === "date"
                              ? "By Date"
                              : "No Groups"}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Group By</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioGroup
                          value={groupingOption}
                          onValueChange={handleGroupingChange}
                        >
                          <DropdownMenuRadioItem value="none">
                            None
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="type">
                            Type
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="date">
                            Date
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* View Mode Toggle */}
                    {/* Change border class for better contrast */}
                    <div className="border-l border-border pl-1.5 ml-0.5">
                      <ToggleGroup
                        type="single"
                        defaultValue="list"
                        value={viewMode}
                        onValueChange={(value: "list" | "grid") => {
                          if (value === "list" || value === "grid") {
                            setViewMode(value);
                          }
                        }}
                        aria-label="View mode"
                        className="h-7"
                      >
                        <ToggleGroupItem
                          value="list"
                          aria-label="List view"
                          className="h-7 w-7 p-0"
                        >
                          <List className="h-3.5 w-3.5" />
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="grid"
                          aria-label="Grid view"
                          className="h-7 w-7 p-0"
                        >
                          <LayoutGrid className="h-3.5 w-3.5" />
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  </div>
                </div>
              </div>
              {/* Simplified Upload Dialog */}
              <Dialog
                open={isUploadDialogOpen}
                onOpenChange={(open) => {
                  setIsUploadDialogOpen(open);
                  // If the dialog just closed and an upload just finished, refresh now
                  if (!open && shouldRefreshAfterUpload.current) {
                    setTimeout(() => {
                      triggerRefresh();
                    }, 100);
                    shouldRefreshAfterUpload.current = false;
                  }
                }}
                modal={true}
              >
                <DialogContent className="sm:max-w-[525px]">
                  <DialogHeader>
                    <DialogTitle>Upload Document</DialogTitle>
                    <DialogDescription>
                      Drag & drop files here or click to select. Files will be
                      added to:{" "}
                      <span className="font-medium">
                        {folderPath[folderPath.length - 1]?.name ?? "Home"}
                      </span>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="pt-4 pb-0">
                    <FileUpload
                      onUploadComplete={handleUploadSuccess}
                      currentFolderId={currentFolderId}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsUploadDialogOpen(false);
                      }}
                    >
                      Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {/* Document Section Header removed to create more space */}
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
                  <div className="h-full overflow-auto">
                    {viewMode === "list" ? (
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
                          grouping={grouping}
                          onGroupingChange={setGrouping} // Ensure this is setGrouping
                          columnVisibility={columnVisibility}
                          onColumnVisibilityChange={setColumnVisibility}
                          onMoveRow={handleMoveRow}
                          onDropItemIntoFolder={handleDropItemIntoFolder}
                          favoriteIds={favoriteIds}
                          handleToggleFavorite={handleToggleFavorite}
                          togglingFavoriteId={togglingFavoriteId}
                          onOpenShareDialog={handleOpenShareDialog} // Pass the handler
                          mobileViewColumn={mobileViewColumn}
                          onToggleMobileViewColumn={() => {
                            const views: (
                              | "none"
                              | "uploadedAt"
                              | "updatedAt"
                              | "size"
                              | "type"
                            )[] = [
                              "none",
                              "uploadedAt",
                              "updatedAt",
                              "size",
                              "type",
                            ];
                            const currentIndex =
                              views.indexOf(mobileViewColumn);
                            const nextIndex = (currentIndex + 1) % views.length;
                            setMobileViewColumn(views[nextIndex]);
                          }}
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
                        favoriteIds={favoriteIds}
                        handleToggleFavorite={handleToggleFavorite}
                        togglingFavoriteId={togglingFavoriteId}
                        onOpenShareDialog={handleOpenShareDialog} // Pass the handler
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      <Dialog
        open={showCreateFolderDialog}
        onOpenChange={setShowCreateFolderDialog}
        modal={true}
      >
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewFolderName(e.target.value)
                }
                className="col-span-3"
                placeholder="My Project Files"
                disabled={isCreatingFolder}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateFolderDialog(false)}
              disabled={isCreatingFolder}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateFolder}
              disabled={isCreatingFolder || !newFolderName.trim()}
            >
              {isCreatingFolder ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isCreatingFolder ? "Creating..." : "Create Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog
        open={!!folderToRename}
        onOpenChange={(open) => !open && setFolderToRename(null)}
        modal={false}
      >
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewRenameFolderName(e.target.value)
                }
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
                "Rename"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Document Modal */}
      <MoveDocumentModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        documentName={movingDocument?.name || ""}
        folders={availableFolders}
        onConfirmMove={handleMoveConfirm}
        isLoadingFolders={isLoadingFolders}
      />
      {sharingDocument && (
        <ShareDialog
          documentId={sharingDocument.id}
          documentName={sharingDocument.name}
          open={isShareDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseShareDialog();
            } else {
              setIsShareDialogOpen(true);
            }
          }}
        />
      )}
    </div>
  );
}

export default DashboardPage;
