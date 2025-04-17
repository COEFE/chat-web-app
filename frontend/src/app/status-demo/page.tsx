'use client';

import React from 'react';
import { 
  StatusBadge, 
  type StatusType, 
  type DocumentStatusType 
} from '@/components/ui/status-badge';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { StatusButton, type ActionType } from '@/components/ui/status-button';
import { 
  Upload, 
  Download, 
  Edit, 
  Trash2, 
  Eye, 
  Plus, 
  Share2, 
  X, 
  Check, 
  Ban 
} from 'lucide-react';

export default function StatusDemo() {
  // Sample status types for demonstration
  const statusTypes: StatusType[] = [
    'success', 'error', 'warning', 'info', 'neutral', 'primary', 'secondary', 'pending'
  ];
  
  // Sample document status types for demonstration
  const documentStatusTypes: DocumentStatusType[] = [
    'draft', 'published', 'archived', 'deleted', 'processing', 'uploading', 'error', 'complete'
  ];
  
  // Sample action types for demonstration
  const actionTypes: ActionType[] = [
    'create', 'delete', 'edit', 'view', 'download', 'upload', 'share', 'cancel', 'approve', 'reject'
  ];
  
  // Icon mapping for action buttons
  const actionIcons: Record<ActionType, React.ReactNode> = {
    create: <Plus />,
    delete: <Trash2 />,
    edit: <Edit />,
    view: <Eye />,
    download: <Download />,
    upload: <Upload />,
    share: <Share2 />,
    cancel: <X />,
    approve: <Check />,
    reject: <Ban />
  };

  return (
    <div className="container mx-auto py-10 space-y-12">
      <div>
        <h1 className="text-3xl font-bold mb-6">Status Indicators System</h1>
        <p className="text-muted-foreground mb-4">
          A consistent color system for status indicators and actions throughout the application.
        </p>
      </div>
      
      {/* Status Badges */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Status Badges</h2>
        <p className="text-muted-foreground mb-4">
          Compact badges for displaying status in tables, lists, and other UI elements.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">General Status Types</h3>
            <div className="flex flex-wrap gap-2">
              {statusTypes.map((status) => (
                <StatusBadge key={status} status={status} />
              ))}
            </div>
            
            <h4 className="text-md font-medium mt-4">Size Variants</h4>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="success" size="sm" />
              <StatusBadge status="success" size="md" />
              <StatusBadge status="success" size="lg" />
            </div>
            
            <h4 className="text-md font-medium mt-4">Without Icons</h4>
            <div className="flex flex-wrap gap-2">
              {statusTypes.slice(0, 4).map((status) => (
                <StatusBadge key={status} status={status} showIcon={false} />
              ))}
            </div>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Document Status Types</h3>
            <div className="flex flex-wrap gap-2">
              {documentStatusTypes.map((status) => (
                <StatusBadge key={status} status={status} />
              ))}
            </div>
            
            <h4 className="text-md font-medium mt-4">Custom Text</h4>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="draft" text="In Draft" />
              <StatusBadge status="published" text="Live" />
              <StatusBadge status="processing" text="Converting..." />
              <StatusBadge status="error" text="Failed to Process" />
            </div>
          </div>
        </div>
      </section>
      
      {/* Status Indicators */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Status Indicators</h2>
        <p className="text-muted-foreground mb-4">
          More detailed status indicators with optional descriptions for notifications, alerts, and feedback.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {statusTypes.map((status) => (
            <StatusIndicator 
              key={status}
              status={status}
              text={`${status.charAt(0).toUpperCase() + status.slice(1)} Status`}
              description={`This is an example of a ${status} status indicator with a description.`}
            />
          ))}
        </div>
      </section>
      
      {/* Status Buttons */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Action Buttons</h2>
        <p className="text-muted-foreground mb-4">
          Buttons with consistent styling based on their action type.
        </p>
        
        <div className="space-y-8">
          <div>
            <h3 className="text-lg font-medium mb-4">Default Variant</h3>
            <div className="flex flex-wrap gap-2">
              {actionTypes.map((action) => (
                <StatusButton 
                  key={action}
                  action={action}
                  icon={actionIcons[action]}
                >
                  {action.charAt(0).toUpperCase() + action.slice(1)}
                </StatusButton>
              ))}
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-medium mb-4">Outline Variant</h3>
            <div className="flex flex-wrap gap-2">
              {actionTypes.slice(0, 5).map((action) => (
                <StatusButton 
                  key={action}
                  action={action}
                  variant="outline"
                  icon={actionIcons[action]}
                >
                  {action.charAt(0).toUpperCase() + action.slice(1)}
                </StatusButton>
              ))}
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-medium mb-4">Ghost Variant</h3>
            <div className="flex flex-wrap gap-2">
              {actionTypes.slice(5, 10).map((action) => (
                <StatusButton 
                  key={action}
                  action={action}
                  variant="ghost"
                  icon={actionIcons[action]}
                >
                  {action.charAt(0).toUpperCase() + action.slice(1)}
                </StatusButton>
              ))}
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-medium mb-4">Status-Based Buttons</h3>
            <div className="flex flex-wrap gap-2">
              {statusTypes.map((status) => (
                <StatusButton 
                  key={status}
                  status={status}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </StatusButton>
              ))}
            </div>
          </div>
        </div>
      </section>
      
      {/* Example Usage */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Example Usage</h2>
        <p className="text-muted-foreground mb-4">
          Examples of how these components can be used together in real UI scenarios.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="border rounded-lg p-6 space-y-4">
            <h3 className="text-lg font-medium">Document Upload Status</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">report-2025.pdf</span>
                <StatusBadge status="complete" />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="font-medium">financial-data.xlsx</span>
                <StatusBadge status="processing" text="Converting" />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="font-medium">presentation.pptx</span>
                <StatusBadge status="error" />
              </div>
              
              <div className="flex justify-end gap-2 mt-4">
                <StatusButton action="upload" size="sm">Upload More</StatusButton>
                <StatusButton action="view" size="sm" variant="outline">View All</StatusButton>
              </div>
            </div>
          </div>
          
          <div className="border rounded-lg p-6 space-y-4">
            <h3 className="text-lg font-medium">System Notifications</h3>
            
            <div className="space-y-4">
              <StatusIndicator 
                status="success"
                text="Backup Completed"
                description="Your files have been successfully backed up to the cloud."
              />
              
              <StatusIndicator 
                status="warning"
                text="Storage Almost Full"
                description="You're using 90% of your available storage. Consider upgrading your plan."
              />
              
              <StatusIndicator 
                status="error"
                text="Connection Failed"
                description="Unable to connect to the server. Please check your internet connection."
              />
              
              <div className="flex justify-end gap-2 mt-4">
                <StatusButton action="view" size="sm">View All Notifications</StatusButton>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
