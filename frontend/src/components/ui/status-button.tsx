import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { actionColors, statusColors } from '@/lib/colors';
import { type StatusType } from './status-badge';

export type ActionType = 'create' | 'delete' | 'edit' | 'view' | 'download' | 'upload' | 'share' | 'cancel' | 'approve' | 'reject';

interface StatusButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  status?: StatusType;
  action?: ActionType;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  className?: string;
}

export function StatusButton({ 
  status,
  action,
  variant = 'default',
  size = 'default',
  icon,
  iconPosition = 'left',
  className,
  children,
  ...props
}: StatusButtonProps) {
  // Get the appropriate color scheme
  let colorScheme;
  
  if (action && actionColors[action]) {
    colorScheme = actionColors[action];
  } else if (status && statusColors[status]) {
    colorScheme = statusColors[status];
  } else {
    // Fallback to primary if the action or status is not found
    if ((action && !actionColors[action]) || (status && !statusColors[status])) {
      console.warn(`Color scheme not found for action: ${action} or status: ${status}, using primary as fallback`);
    }
    colorScheme = statusColors.primary || {
      button: 'bg-primary text-primary-foreground hover:bg-primary/90',
      buttonOutline: 'border border-primary/20 text-primary hover:bg-primary/10',
      text: 'text-primary',
      backgroundHover: 'hover:bg-primary/10'
    };
  }
  
  // Determine the class based on variant
  let variantClass = '';
  
  if (variant === 'default') {
    variantClass = colorScheme?.button || 'bg-primary text-primary-foreground hover:bg-primary/90';
  } else if (variant === 'outline') {
    variantClass = colorScheme?.buttonOutline || 'border border-primary/20 text-primary hover:bg-primary/10';
  } else if (variant === 'ghost') {
    // For ghost variant, we need to handle the text and backgroundHover properties separately
    const textClass = colorScheme?.text || 'text-primary';
    const hoverClass = colorScheme?.backgroundHover || 'hover:bg-primary/10';
    variantClass = `${textClass} ${hoverClass}`;
  }

  return (
    <Button
      variant={variant === 'ghost' ? 'ghost' : 'custom'}
      size={size}
      className={cn(
        variant !== 'ghost' && variantClass,
        className
      )}
      {...props}
    >
      {icon && iconPosition === 'left' && (
        <span className="mr-2">{icon}</span>
      )}
      {children}
      {icon && iconPosition === 'right' && (
        <span className="ml-2">{icon}</span>
      )}
    </Button>
  );
}
