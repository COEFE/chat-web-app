import React from 'react';
import { cn } from '@/lib/utils';
import { statusColors, documentStatusColors } from '@/lib/colors';
import { CheckCircle, AlertCircle, Clock, Info, AlertTriangle, HelpCircle } from 'lucide-react';

export type StatusType = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'primary' | 'secondary' | 'pending';
export type DocumentStatusType = 'draft' | 'published' | 'archived' | 'deleted' | 'processing' | 'uploading' | 'error' | 'complete';

interface StatusBadgeProps {
  status: StatusType | DocumentStatusType;
  text?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StatusBadge({ 
  status, 
  text, 
  showIcon = true, 
  size = 'md',
  className 
}: StatusBadgeProps) {
  // Determine if this is a document status or general status
  const isDocumentStatus = Object.keys(documentStatusColors).includes(status);
  
  // Get the appropriate color scheme
  let colorScheme;
  if (isDocumentStatus && documentStatusColors[status as DocumentStatusType]) {
    colorScheme = documentStatusColors[status as DocumentStatusType];
  } else if (statusColors[status as StatusType]) {
    colorScheme = statusColors[status as StatusType];
  } else {
    // Fallback to neutral if the status is not found
    console.warn(`Status color not found for: ${status}, using neutral as fallback`);
    colorScheme = statusColors.neutral;
  }
  
  // Default text if not provided
  const displayText = text || status.charAt(0).toUpperCase() + status.slice(1);
  
  // Size classes
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 rounded',
    md: 'text-sm px-2 py-1 rounded-md',
    lg: 'text-base px-3 py-1.5 rounded-lg'
  };
  
  // Icon mapping
  const StatusIcon = () => {
    switch(status) {
      case 'success':
      case 'complete':
      case 'published':
        return <CheckCircle className="w-3.5 h-3.5 mr-1" />;
      case 'error':
      case 'deleted':
        return <AlertCircle className="w-3.5 h-3.5 mr-1" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 mr-1" />;
      case 'info':
        return <Info className="w-3.5 h-3.5 mr-1" />;
      case 'pending':
      case 'processing':
      case 'uploading':
        return <Clock className="w-3.5 h-3.5 mr-1" />;
      default:
        return <HelpCircle className="w-3.5 h-3.5 mr-1" />;
    }
  };

  return (
    <span 
      className={cn(
        'inline-flex items-center font-medium',
        colorScheme?.background || 'bg-gray-100 dark:bg-gray-800',
        colorScheme?.border || 'border border-gray-200 dark:border-gray-700',
        colorScheme?.text || 'text-gray-700 dark:text-gray-300',
        sizeClasses[size] || 'text-sm px-2 py-1 rounded-md',
        className
      )}
    >
      {showIcon && <StatusIcon />}
      {displayText}
    </span>
  );
}
