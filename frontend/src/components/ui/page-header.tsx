import { ReactNode } from "react";

interface PageHeaderProps {
  heading: string;
  subheading?: string;
  actions?: ReactNode;
}

export function PageHeader({ heading, subheading, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{heading}</h1>
        {subheading && (
          <p className="text-gray-500 mt-1">{subheading}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
