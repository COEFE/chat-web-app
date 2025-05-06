"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";

import { TrialBalanceReport } from "@/components/reports/TrialBalanceReport";
import { IncomeStatementReport } from "@/components/reports/IncomeStatementReport";
import { BalanceSheetReport } from "@/components/reports/BalanceSheetReport";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("trial-balance");
  
  return (
    <div className="container mx-auto py-4">
      <h1 className="text-2xl font-bold mb-4">Financial Reports</h1>
      
      <Tabs defaultValue="trial-balance" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
        </TabsList>
        
        <TabsContent value="trial-balance">
          <TrialBalanceReport />
        </TabsContent>
        
        <TabsContent value="income-statement">
          <IncomeStatementReport />
        </TabsContent>
        
        <TabsContent value="balance-sheet">
          <BalanceSheetReport />
        </TabsContent>
      </Tabs>
      
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>About Financial Reports</CardTitle>
          <CardDescription>
            Understanding the different financial reports and their purpose
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Trial Balance</h3>
            <p className="text-muted-foreground">
              A Trial Balance shows all accounts with their debit or credit balances for a specific period.
              It helps verify that the total debits equal total credits, confirming that the books are balanced.
              This is not a formal financial statement, but an internal accounting check.
            </p>
          </div>
          
          <div>
            <h3 className="text-lg font-medium">Income Statement</h3>
            <p className="text-muted-foreground">
              Also known as a Profit and Loss Statement, this report shows revenues and expenses over a specific period.
              It indicates whether the business is profitable by displaying net income (profit) or net loss.
              The Income Statement covers a period of time (e.g., month, quarter, or year).
            </p>
          </div>
          
          <div>
            <h3 className="text-lg font-medium">Balance Sheet</h3>
            <p className="text-muted-foreground">
              The Balance Sheet displays what a company owns (assets), what it owes (liabilities), and equity at a specific point in time.
              It follows the accounting equation: Assets = Liabilities + Equity.
              Unlike the other reports, the Balance Sheet represents a snapshot of financial position on a specific date.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
