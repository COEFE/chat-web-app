'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  id: string;
  name: string;
}

interface BreadcrumbsProps {
  path: BreadcrumbItem[];
  onNavigate: (folderId: string) => void;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ path, onNavigate }) => {
  return (
    <nav aria-label="breadcrumb" className="mb-4 flex items-center space-x-1 text-sm text-muted-foreground">
      <button
        onClick={() => onNavigate('root')} // Assuming 'root' is the ID for the top-level
        className="hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm"
      >
        Home
      </button>
      {path.map((item, index) => (
        <React.Fragment key={item.id}>
          <ChevronRight className="h-4 w-4" />
          {index === path.length - 1 ? (
            <span className="font-medium text-foreground" aria-current="page">
              {item.name}
            </span>
          ) : (
            <button
              onClick={() => onNavigate(item.id)}
              className="hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm"
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
