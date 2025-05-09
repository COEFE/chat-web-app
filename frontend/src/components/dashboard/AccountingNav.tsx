"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  CircleDollarSign,
  CreditCard,
  FileText,
  BarChart3,
  Users,
  Receipt,
  Building,
  AreaChart,
  Settings
} from "lucide-react";

export function AccountingNav() {
  const pathname = usePathname();
  
  const links = [
    {
      name: "Accounts Payable",
      href: "/dashboard/accounts-payable",
      icon: CreditCard,
      subLinks: [
        { name: "Vendors", href: "/dashboard/accounts-payable/vendors" },
        { name: "Bills", href: "/dashboard/accounts-payable/bills" },
        { name: "Aging Report", href: "/dashboard/accounts-payable/aging-report" }
      ]
    },
    {
      name: "Accounts Receivable",
      href: "/dashboard/accounts-receivable",
      icon: Receipt,
      subLinks: [
        { name: "Customers", href: "/dashboard/accounts-receivable/customers" },
        { name: "Invoices", href: "/dashboard/accounts-receivable/invoices" },
        { name: "Aging Report", href: "/dashboard/accounts-receivable/aging-report" }
      ]
    },
    {
      name: "Banking",
      href: "/dashboard/banking",
      icon: Building,
      subLinks: [
        { name: "Bank Accounts", href: "/dashboard/banking" },
        { name: "Reconciliation", href: "/dashboard/banking/reconciliation" }
      ]
    },
    {
      name: "General Ledger",
      href: "/dashboard/gl-transactions",
      icon: FileText,
      subLinks: []
    },
    {
      name: "Financial Reports",
      href: "/dashboard/reports",
      icon: BarChart3,
      subLinks: []
    },
    {
      name: "Admin",
      href: "/dashboard/admin",
      icon: Settings,
      subLinks: [
        { name: "Database", href: "/dashboard/admin/database" }
      ]
    }
  ];

  return (
    <div className="bg-card rounded-lg shadow-sm border p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {links.map((group) => (
          <div key={group.name} className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <group.icon className="h-4 w-4 text-muted-foreground" />
              <Link 
                href={group.href}
                className={cn(
                  "text-sm font-medium hover:underline",
                  pathname === group.href ? "text-primary" : "text-muted-foreground"
                )}
              >
                {group.name}
              </Link>
            </div>
            
            {group.subLinks.length > 0 && (
              <div className="pl-6 space-y-1 border-l-2 border-muted">
                {group.subLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "block text-sm hover:underline",
                      pathname.includes(link.href) ? "text-primary font-medium" : "text-muted-foreground"
                    )}
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
