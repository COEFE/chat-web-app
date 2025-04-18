// /Users/christopherealy/Desktop/code/chat-web-app/frontend/src/components/dashboard/DraggableRow.tsx
'use client';

import React, { useRef } from 'react';
import { useDrag, useDrop, XYCoord } from 'react-dnd';
import { Row } from '@tanstack/react-table';
import { FilesystemItem } from '@/types';
import { cn } from '@/lib/utils'; // Import cn for combining classes

// Define Item Types
export const ItemTypes = {
  ROW: 'row', // For reordering within the same list
  FILESYSTEM_ITEM: 'filesystem_item', // For moving items (potentially into folders)
};

// Define the type for the item being dragged
interface DragItem {
  id: string;
  index: number;
  type: string; // Now includes the specific drag type
  original: FilesystemItem; // Include the full item data
}

// Define the props for the DraggableRow component
// Extend React.ComponentProps<'tr'> to include standard <tr> attributes
interface DraggableRowProps extends React.ComponentProps<'tr'> {
  row: Row<FilesystemItem>;
  // children is already included in ComponentProps<'tr'>, but keeping it explicit is fine
  children: React.ReactNode; 
  onMoveRow: (dragIndex: number, hoverIndex: number) => void;
  onDropItemIntoFolder: (itemId: string, targetFolderId: string) => void; // New prop
}

// Remove React.FC as it's often discouraged and ComponentProps handles children
export const DraggableRow = ({
  row,
  children,
  onMoveRow,
  onDropItemIntoFolder, // Destructure new prop
  ...props // Spread remaining props (like className, style, etc.) onto the <tr>
}: DraggableRowProps) => {
  const ref = useRef<HTMLTableRowElement>(null);
  const item = row.original; // Get the original item data

  // useDrop hook for handling drops onto this row
  const [{ handlerId, isOver, canDrop }, drop] = useDrop<
    DragItem,
    void,
    { handlerId: string | symbol | null; isOver: boolean; canDrop: boolean }
  >({
    // Accept both types, but handle them differently in drop/hover
    accept: [ItemTypes.ROW, ItemTypes.FILESYSTEM_ITEM],
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
        isOver: monitor.isOver(),
        // Determine if dropping is allowed
        canDrop: monitor.canDrop() &&
                 item.type === 'folder' && // Target must be a folder
                 monitor.getItem()?.original?.id !== item.id && // Cannot drop onto self
                 // Allow drop if dragged has no parent OR parent is not the target
                 (!monitor.getItem()?.original?.parentId || monitor.getItem()?.original?.parentId !== item.id),
      };
    },
    hover(draggedItem: DragItem, monitor) {
      // Basic check: ensure we have refs and the item hasn't changed
      if (!ref.current || draggedItem.id === item.id) {
        return;
      }

      const dragIndex = draggedItem.index;
      const hoverIndex = row.index;

      console.log(`Hover: Drag Index=${dragIndex}, Hover Index=${hoverIndex}, Dragged=${draggedItem.original.name}, Target=${item.name}`);

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        console.log('Hover: Drag index === hover index, returning.');
        return;
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect();

      // Get vertical middle
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;

      // Determine mouse position
      const clientOffset = monitor.getClientOffset();

      // Get pixels to the top
      const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top;

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%

      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        console.log('Hover: Dragging downwards, but not past middle.');
        return;
      }

      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        console.log('Hover: Dragging upwards, but not past middle.');
        return;
      }

      // --- Reordering Logic --- 
      // Check if the target is a folder and if dropping is allowed (canDrop is true)
      // If it *is* a valid folder drop target, we DON'T reorder, we let the drop handler manage it.
      const isPotentialFolderDrop = item.type === 'folder' && monitor.canDrop();

      if (isPotentialFolderDrop) {
        console.log(`Hover: Over potential folder drop target '${item.name}'. Skipping reorder.`);
        // Optional: Add visual cue specifically for folder hover distinct from reorder hover?
        return; // Don't call onMoveRow if we are hovering over a valid folder drop target
      }

      console.log(`Hover: Conditions met for reorder! Calling onMoveRow: dragIndex=${dragIndex}, hoverIndex=${hoverIndex}`);
      onMoveRow(dragIndex, hoverIndex);

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations, but here we must update the index
      // so we don't flicker if the mouse moves slowly over the item.
      draggedItem.index = hoverIndex; // Mutate index for smoother hover
    },
    drop(draggedItem: DragItem, monitor) {
      console.log('Drop event triggered on:', item.name, 'Dragged item:', draggedItem.original.name, 'Type:', draggedItem.type);
      // Only handle drop *into* folder if the target is a folder and the dragged item is a FILESYSTEM_ITEM
      if (item.type === 'folder' && draggedItem.type === ItemTypes.FILESYSTEM_ITEM) {
        console.log(`Checking drop conditions: target folder='${item.name}', item='${draggedItem.original.name}'`);
        // Prevent dropping an item into itself or its current parent (using optional chaining)
        if (draggedItem.id !== item.id && draggedItem.original?.parentId !== item.id) {
          console.log(`Conditions met! Calling onDropItemIntoFolder: itemId=${draggedItem.id}, targetFolderId=${item.id}`);
          onDropItemIntoFolder(draggedItem.id, item.id);
        } else {
          // Use optional chaining in the log message as well
          console.log(`Drop prevented: either dropping onto self (item.id=${item.id}) or into current parent (item.parentId=${draggedItem.original?.parentId})`);
        }
      } else {
        console.log('Drop condition not met (target not folder or dragged item type mismatch).');
      }
      // Drop handler for reordering (type ROW) is handled by the hover logic triggering onMoveRow
    },
  });

  // useDrag hook for making the row draggable
  const [{ isDragging }, drag] = useDrag({
    // Use FILESYSTEM_ITEM type for dragging in general
    type: ItemTypes.FILESYSTEM_ITEM,
    item: () => {
      // Return all necessary info, including the original item data
      return { id: item.id, index: row.index, type: ItemTypes.FILESYSTEM_ITEM, original: item };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    // Optional: Disable dragging if the item is, for example, the root folder or has certain permissions
    // canDrag: () => item.id !== 'root', // Example: cannot drag the root
  });

  // Apply styles based on dragging state
  const opacity = isDragging ? 0.4 : 1;
  // Highlight potential drop target folders
  const backgroundColor = isOver && canDrop ? 'bg-blue-100 dark:bg-blue-900/50' : '';

  // Attach the drag and drop refs to the TableRow element
  drag(drop(ref));

  return (
    <tr // Use native tr element
      ref={ref}
      style={{ opacity }} // Apply opacity style directly
      data-handler-id={handlerId} // Keep handlerId for debugging
      // Combine classes: base styles, cursor, hover effects, drop target highlight
      className={cn(
        'border-b transition-colors data-[state=selected]:bg-muted', // Base Shadcn styles (example)
        'cursor-move', // Indicate draggable
        !isDragging ? 'hover:bg-muted/50' : '', // Normal hover effect when not dragging
        backgroundColor // Apply drop target highlight
      )}
      {...props} // Spread the rest of the props onto the <tr> element
    >
      {children}
    </tr>
  );
};
