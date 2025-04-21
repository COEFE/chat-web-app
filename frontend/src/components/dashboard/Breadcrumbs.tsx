'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { BreadcrumbItem } from '@/types';

interface BreadcrumbsProps {
  path: BreadcrumbItem[];
  onNavigate: (folderId: string | null) => void;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ path, onNavigate }) => {
  // Only show the breadcrumb navigation if there's a path (we're in a subfolder)
  if (path.length === 0) {
    return null;
  }
  
  return (
    <nav aria-label="breadcrumb" className="mb-4 flex items-center space-x-1 text-sm text-muted-foreground pt-1">
      <button
        onClick={() => onNavigate(null)}
        className="hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm py-1.5"
      >
        Home
      </button>
      {path.map((item, index) => (
        <React.Fragment key={item.id ?? 'root'}>
          <ChevronRight className="h-4 w-4" />
          {index === path.length - 1 ? (
            <span className="font-medium text-foreground" aria-current="page">
              {item.name}
            </span>
          ) : (
            <button
              onClick={() => onNavigate(item.id)}
              className="hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm py-1.5"
            >
              {item.name}
            </button>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

export default Breadcrumbs;
