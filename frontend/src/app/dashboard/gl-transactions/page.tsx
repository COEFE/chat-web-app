"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Upload, Database } from 'lucide-react';
import XLSX from 'xlsx-js-style';

interface TxnRow {
  [key: string]: any;
}

export default function GLTransactionsPage() {
  const [activeTab, setActiveTab] = useState('upload');
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<TxnRow[]>([]);
  const [loadingParse, setLoadingParse] = useState(false);
  const [loadingIngest, setLoadingIngest] = useState(false);
  const [txns, setTxns] = useState<any[]>([]);
  const [loadingManage, setLoadingManage] = useState(false);
  const [loadingClearTxns, setLoadingClearTxns] = useState<boolean>(false);
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) router.push('/login');
  }, [user, router]);

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

  const parseRows = async () => {
    setLoadingParse(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Auth required');
      const res = await fetch('/api/gl-transactions/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ raw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parse failed');
      setParsed(data.rows || []);
    } catch (e: any) {
      toast({ title: 'Parse error', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingParse(false);
    }
  };

  const ingestRows = async () => {
    setLoadingIngest(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Auth required');
      const res = await fetch('/api/gl-transactions/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ingest failed');
      toast({ title: 'Ingested', description: `Inserted ${data.insertedCount}` });
      setRaw('');
      setParsed([]);
    } catch (e: any) {
      toast({ title: 'Ingest error', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingIngest(false);
    }
  };

  const fetchTxns = async () => {
    setLoadingManage(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Auth required');
      const res = await fetch('/api/gl-transactions', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fetch failed');
      setTxns(data.items || []);
    } catch (e: any) {
      toast({ title: 'Fetch error', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingManage(false);
    }
  };

  async function clearGLTransactions() {
    setLoadingClearTxns(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Auth required');
      const res = await fetch('/api/clear-gl-transactions', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Clear failed');
      toast({ title: 'Cleared', description: data.message });
      fetchTxns();
    } catch (err: any) {
      toast({ title: 'Clear error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingClearTxns(false);
    }
  }

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    if (val === 'manage') fetchTxns();
  };

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">GL Transactions</h1>
      <Tabs defaultValue="upload" onValueChange={handleTabChange}>
        <TabsList className="mb-4">
          <TabsTrigger value="upload" className="flex items-center">
            <Upload className="w-4 h-4 mr-2" /> Upload
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex items-center">
            <Database className="w-4 h-4 mr-2" /> Manage
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload Transactions</CardTitle>
              <CardDescription>Upload CSV/XLSX export from QuickBooks or paste raw CSV.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <input type="file" accept=".csv,.xlsx,.txt" onChange={handleFileChange} />
                <textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="w-full h-32 border rounded p-2" />
                <Button onClick={parseRows} disabled={!raw || loadingParse}>
                  {loadingParse ? <Loader2 className="animate-spin mr-2" /> : 'Parse'}
                </Button>
              </div>
              {parsed.length > 0 && (
                <div className="mt-4">
                  <div className="overflow-auto max-h-[300px] border rounded">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr>
                          {Object.keys(parsed[0]).map((k) => (
                            <th key={k} className="px-2 py-1 text-left bg-gray-100">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.slice(0, 20).map((row, i) => (
                          <tr key={i} className="odd:bg-white even:bg-gray-50">
                            {Object.keys(parsed[0]).map((k) => (
                              <td key={k} className="px-2 py-1">{String(row[k])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button onClick={ingestRows} disabled={loadingIngest} variant="default" className="mt-2">
                    {loadingIngest ? <Loader2 className="animate-spin mr-2" /> : 'Upload to DB'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manage Tab */}
        <TabsContent value="manage" className="space-y-4">
          <Card>
            <CardHeader className="flex justify-between items-center">
              <div>
                <CardTitle>Manage Transactions</CardTitle>
                <CardDescription>View stored transactions (latest 100).</CardDescription>
              </div>
              <div className="space-x-2">
                <Button onClick={fetchTxns} variant="outline" disabled={loadingManage || loadingClearTxns}>
                  {loadingManage ? <Loader2 className="animate-spin h-4 w-4" /> : 'Refresh'}
                </Button>
                <Button onClick={clearGLTransactions} variant="destructive" disabled={loadingClearTxns || loadingManage}>
                  {loadingClearTxns ? <Loader2 className="animate-spin h-4 w-4" /> : 'Clear'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingManage ? (
                <div className="flex justify-center py-6"><Loader2 className="animate-spin h-6 w-6" /></div>
              ) : txns.length > 0 ? (
                <div className="overflow-auto max-h-[500px] border rounded">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr>
                        {Object.keys(txns[0].data).map((k) => (
                          <th key={k} className="px-2 py-1 bg-gray-100 text-left">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {txns.map((t) => (
                        <tr key={t.id} className="odd:bg-white even:bg-gray-50">
                          {Object.keys(txns[0].data).map((k) => (
                            <td key={k} className="px-2 py-1">{String(t.data[k])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No transactions found.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
