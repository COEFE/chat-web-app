/**
 * Color System for Status Indicators and Actions
 * 
 * This file defines a consistent color system for status indicators and actions
 * throughout the application. Each status has a set of colors for different
 * states (default, hover, active) and accessibility considerations.
 * 
 * Usage:
 * import { statusColors } from '@/lib/colors';
 * 
 * <div className={statusColors.success.background}>Success message</div>
 */

// Status color definitions using Tailwind CSS classes
export const statusColors = {
  // Success states (completed actions, confirmations)
  success: {
    background: 'bg-green-50 dark:bg-green-950',
    backgroundHover: 'hover:bg-green-100 dark:hover:bg-green-900',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-300',
    icon: 'text-green-500 dark:text-green-400',
    // For buttons and interactive elements
    button: 'bg-green-600 hover:bg-green-700 text-white',
    buttonOutline: 'border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900',
  },
  
  // Error states (failed actions, critical issues)
  error: {
    background: 'bg-red-50 dark:bg-red-950',
    backgroundHover: 'hover:bg-red-100 dark:hover:bg-red-900',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    icon: 'text-red-500 dark:text-red-400',
    // For buttons and interactive elements
    button: 'bg-red-600 hover:bg-red-700 text-white',
    buttonOutline: 'border-red-600 text-red-600 hover:bg-red-50 dark:hover:bg-red-900',
  },
  
  // Warning states (potential issues, important notices)
  warning: {
    background: 'bg-amber-50 dark:bg-amber-950',
    backgroundHover: 'hover:bg-amber-100 dark:hover:bg-amber-900',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
    icon: 'text-amber-500 dark:text-amber-400',
    // For buttons and interactive elements
    button: 'bg-amber-600 hover:bg-amber-700 text-white',
    buttonOutline: 'border-amber-600 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900',
  },
  
  // Info states (neutral information, guidance)
  info: {
    background: 'bg-blue-50 dark:bg-blue-950',
    backgroundHover: 'hover:bg-blue-100 dark:hover:bg-blue-900',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    icon: 'text-blue-500 dark:text-blue-400',
    // For buttons and interactive elements
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonOutline: 'border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900',
  },
  
  // Neutral states (disabled, inactive)
  neutral: {
    background: 'bg-gray-50 dark:bg-gray-900',
    backgroundHover: 'hover:bg-gray-100 dark:hover:bg-gray-800',
    border: 'border-gray-200 dark:border-gray-700',
    text: 'text-gray-700 dark:text-gray-300',
    icon: 'text-gray-500 dark:text-gray-400',
    // For buttons and interactive elements
    button: 'bg-gray-600 hover:bg-gray-700 text-white',
    buttonOutline: 'border-gray-600 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800',
  },
  
  // Primary action (main actions, focus points)
  primary: {
    background: 'bg-primary/10 dark:bg-primary/20',
    backgroundHover: 'hover:bg-primary/20 dark:hover:bg-primary/30',
    border: 'border-primary/20 dark:border-primary/30',
    text: 'text-primary dark:text-primary/90',
    icon: 'text-primary dark:text-primary/90',
    // For buttons and interactive elements
    button: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    buttonOutline: 'border-primary text-primary hover:bg-primary/10 dark:hover:bg-primary/20',
  },
  
  // Secondary action (alternative actions)
  secondary: {
    background: 'bg-secondary dark:bg-secondary',
    backgroundHover: 'hover:bg-secondary/80 dark:hover:bg-secondary/80',
    border: 'border-secondary/20 dark:border-secondary/30',
    text: 'text-secondary-foreground dark:text-secondary-foreground',
    icon: 'text-secondary-foreground/70 dark:text-secondary-foreground/70',
    // For buttons and interactive elements
    button: 'bg-secondary hover:bg-secondary/90 text-secondary-foreground',
    buttonOutline: 'border-secondary text-secondary-foreground hover:bg-secondary/10',
  },
  
  // Pending states (in progress, loading)
  pending: {
    background: 'bg-purple-50 dark:bg-purple-950',
    backgroundHover: 'hover:bg-purple-100 dark:hover:bg-purple-900',
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-700 dark:text-purple-300',
    icon: 'text-purple-500 dark:text-purple-400',
    // For buttons and interactive elements
    button: 'bg-purple-600 hover:bg-purple-700 text-white',
    buttonOutline: 'border-purple-600 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900',
  },
};

// Document status colors (for document states in the application)
export const documentStatusColors = {
  draft: statusColors.neutral,
  published: statusColors.success,
  archived: statusColors.neutral,
  deleted: statusColors.error,
  processing: statusColors.pending,
  processed: statusColors.success,  // Added for document processing status
  uploading: statusColors.pending,
  error: statusColors.error,
  complete: statusColors.success,
  success: statusColors.success,  // Added for FileUpload component
  pending: statusColors.pending,   // Added for FileUpload component
};

// Action colors (for buttons and interactive elements)
export const actionColors = {
  create: statusColors.success,
  delete: statusColors.error,
  edit: statusColors.info,
  view: statusColors.primary,
  download: statusColors.info,
  upload: statusColors.primary,
  share: statusColors.info,
  cancel: statusColors.neutral,
  approve: statusColors.success,
  reject: statusColors.error,
};
