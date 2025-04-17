import React from 'react';
import { cn } from '@/lib/utils';
import { statusColors } from '@/lib/colors';
import { type StatusType } from './status-badge';
import { 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Info, 
  AlertTriangle, 
  HelpCircle,
  CircleDashed
} from 'lucide-react';

interface StatusIndicatorProps {
  status: StatusType;
  text?: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  descriptionClassName?: string;
}

export function StatusIndicator({ 
  status, 
  text, 
  description,
  icon,
  className,
  iconClassName,
  textClassName,
  descriptionClassName
}: StatusIndicatorProps) {
  // Get the appropriate color scheme
  const colorScheme = statusColors[status] || statusColors.neutral;
  
  // Log a warning if the status color is not found
  if (!statusColors[status]) {
    console.warn(`Status color not found for: ${status}, using neutral as fallback`);
  }
  
  // Default text if not provided
  const displayText = text || status.charAt(0).toUpperCase() + status.slice(1);
  
  // Icon mapping
  const StatusIcon = () => {
    if (icon) return <>{icon}</>;
    
    switch(status) {
      case 'success':
        return <CheckCircle className={cn("w-5 h-5", colorScheme?.icon || "text-green-500", iconClassName)} />;
      case 'error':
        return <AlertCircle className={cn("w-5 h-5", colorScheme?.icon || "text-red-500", iconClassName)} />;
      case 'warning':
        return <AlertTriangle className={cn("w-5 h-5", colorScheme?.icon || "text-amber-500", iconClassName)} />;
      case 'info':
        return <Info className={cn("w-5 h-5", colorScheme?.icon || "text-blue-500", iconClassName)} />;
      case 'pending':
        return <Clock className={cn("w-5 h-5", colorScheme?.icon || "text-purple-500", iconClassName)} />;
      case 'neutral':
        return <CircleDashed className={cn("w-5 h-5", colorScheme?.icon || "text-gray-500", iconClassName)} />;
      default:
        return <HelpCircle className={cn("w-5 h-5", colorScheme?.icon || "text-gray-500", iconClassName)} />;
    }
  };

  return (
    <div className={cn("flex items-start", className)}>
      <div className="flex-shrink-0 mr-3">
        <StatusIcon />
      </div>
      <div>
        <p className={cn("font-medium", colorScheme?.text || "text-gray-700 dark:text-gray-300", textClassName)}>
          {displayText}
        </p>
        {description && (
          <p className={cn("text-sm", colorScheme?.text || "text-gray-700 dark:text-gray-300", "opacity-80", descriptionClassName)}>
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
