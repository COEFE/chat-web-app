"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Upload, Database } from "lucide-react";
import XLSX from "xlsx-js-style";

interface BudgetItem {
  id?: string;
  period: string;
  memo: string;
  amount: number;
}

export default function BudgetManagementPage() {
  const [activeTab, setActiveTab] = useState<string>("upload");
  const [raw, setRaw] = useState<string>("");
  const [parsed, setParsed] = useState<BudgetItem[]>([]);
  const [loadingParse, setLoadingParse] = useState<boolean>(false);
  const [loadingIngest, setLoadingIngest] = useState<boolean>(false);
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const [loadingManage, setLoadingManage] = useState<boolean>(false);
  const [loadingClearBudget, setLoadingClearBudget] = useState<boolean>(false);
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) router.push("/login");
  }, [user, router]);

  const fetchBudgets = async () => {
    setLoadingManage(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Authentication required");
      const res = await fetch('/api/budget', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch budgets");
      setBudgets(data.items || []);
    } catch (err: any) {
      toast({ title: "Fetch error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingManage(false);
    }
  };

  async function clearBudget() {
    setLoadingClearBudget(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Authentication required');
      const res = await fetch('/api/clear-budget', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Clear failed');
      toast({ title: 'Cleared', description: data.message });
      fetchBudgets();
    } catch (err: any) {
      toast({ title: 'Clear error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingClearBudget(false);
    }
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'manage') fetchBudgets();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv' || ext === 'txt') {
      setRaw(await file.text());
    } else {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      setRaw(XLSX.utils.sheet_to_csv(ws));
    }
  };

  const parseBudget = async () => {
    setLoadingParse(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Authentication required");
      const res = await fetch('/api/budget/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ raw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed");
      setParsed(data.items || []);
    } catch (err: any) {
      toast({ title: "Parse error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingParse(false);
    }
  };

  const ingestBudget = async () => {
    setLoadingIngest(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Authentication required");
      const res = await fetch('/api/budget/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingest failed");
      toast({ title: "Ingested", description: `Inserted ${data.inserted.length} items` });
      setRaw('');
      setParsed([]);
    } catch (err: any) {
      toast({ title: "Ingest error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingIngest(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Budget Management</h1>
      </div>
      <Tabs defaultValue="upload" onValueChange={handleTabChange}>
        <TabsList className="mb-4">
          <TabsTrigger value="upload" className="flex items-center">
            <Upload className="w-4 h-4 mr-2" />
            Upload Budget
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex items-center">
            <Database className="w-4 h-4 mr-2" />
            Manage Budgets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload Budget</CardTitle>
              <CardDescription>Upload or paste budget data to parse and store.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <input type="file" accept=".csv,.xlsx,.txt" onChange={handleFileChange} />
                <textarea
                  className="w-full h-32 border rounded p-2"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder="Or paste raw data here"
                />
                <Button onClick={parseBudget} disabled={!raw || loadingParse}>
                  {loadingParse ? <Loader2 className="animate-spin mr-2" /> : 'Parse'}
                </Button>
              </div>
              {parsed.length > 0 && (
                <div className="mt-4">
                  <table className="min-w-full divide-y divide-gray-200 mb-2">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left">Period</th>
                        <th className="px-4 py-2 text-left">Memo</th>
                        <th className="px-4 py-2 text-left">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.map((b, i) => (
                        <tr key={i} className="odd:bg-white even:bg-gray-50">
                          <td className="px-4 py-2">{b.period}</td>
                          <td className="px-4 py-2">{b.memo}</td>
                          <td className="px-4 py-2">{b.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Button variant="default" onClick={ingestBudget} disabled={loadingIngest}>
                    {loadingIngest ? <Loader2 className="animate-spin mr-2" /> : 'Upload to DB'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Manage Budgets</CardTitle>
                <CardDescription>View saved budget entries.</CardDescription>
              </div>
              <div className="space-x-2">
                <Button variant="outline" onClick={fetchBudgets} disabled={loadingManage || loadingClearBudget}>
                  {loadingManage ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                </Button>
                <Button variant="destructive" onClick={clearBudget} disabled={loadingClearBudget || loadingManage}>
                  {loadingClearBudget ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Clear'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingManage ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : budgets.length > 0 ? (
                <div className="border rounded-md overflow-auto max-h-[500px]">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-200 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Period</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Memo</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-black">
                      {budgets.map((budget) => (
                        <tr key={budget.id} className="odd:bg-white even:bg-gray-100">
                          <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">{budget.period}</td>
                          <td className="px-4 py-2 text-sm">{budget.memo}</td>
                          <td className="px-4 py-2 text-sm">{budget.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No budget entries found. Upload some budgets using the upload tab.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
