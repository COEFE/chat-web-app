"use client";

import React, { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AccountNode {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  notes: string | null;
  is_custom: boolean;
  is_active?: boolean;
  children: AccountNode[];
  balance?: number;
}

interface AccountTreeProps {
  accounts: AccountNode[];
  onAddAccount?: (parentId: number | null) => void;
  onEditAccount?: (account: AccountNode) => void;
  onDeleteAccount?: (account: AccountNode) => void;
  className?: string;
}

export function AccountTree({
  accounts,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  className
}: AccountTreeProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {accounts.map((account) => (
        <AccountTreeItem
          key={account.id}
          account={account}
          level={0}
          onAddAccount={onAddAccount}
          onEditAccount={onEditAccount}
          onDeleteAccount={onDeleteAccount}
        />
      ))}
    </div>
  );
}

interface AccountTreeItemProps {
  account: AccountNode;
  level: number;
  onAddAccount?: (parentId: number | null) => void;
  onEditAccount?: (account: AccountNode) => void;
  onDeleteAccount?: (account: AccountNode) => void;
}

function AccountTreeItem({
  account,
  level,
  onAddAccount,
  onEditAccount,
  onDeleteAccount
}: AccountTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(level < 1);
  const hasChildren = account.children && account.children.length > 0;
  
  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div>
      <div 
        className={cn(
          "flex items-center py-2 px-2 rounded-md hover:bg-muted/50 transition-colors group",
          level === 0 && "font-medium"
        )}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={toggleExpand}
            className="mr-1 h-4 w-4 flex items-center justify-center"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <div className="mr-1 w-4" />
        )}
        
        <div className="flex-1 flex items-center">
          <span className="text-sm font-mono mr-2">{account.code}</span>
          <span className="flex-1">{account.name}</span>
          
          {account.balance !== undefined && (
            <span className="text-sm tabular-nums text-muted-foreground mr-4">
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(account.balance)}
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onAddAccount && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onAddAccount(account.id);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="sr-only">Add</span>
            </Button>
          )}
          
          {onEditAccount && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onEditAccount(account);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="sr-only">Edit</span>
            </Button>
          )}
          
          {onDeleteAccount && account.is_custom && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteAccount(account);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Delete</span>
            </Button>
          )}
        </div>
      </div>
      
      {isExpanded && hasChildren && (
        <div>
          {account.children.map((child) => (
            <AccountTreeItem
              key={child.id}
              account={child}
              level={level + 1}
              onAddAccount={onAddAccount}
              onEditAccount={onEditAccount}
              onDeleteAccount={onDeleteAccount}
            />
          ))}
        </div>
      )}
    </div>
  );
}
