"use client";
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import XLSX from 'xlsx-js-style';
import { useToast } from '@/components/ui/use-toast';

interface Item { period: string; memo: string; amount: number; }

export default function BudgetPage() {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!user) router.push('/login');
  }, [user, router]);
  const [raw, setRaw] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [loadingParse, setLoadingParse] = useState(false);
  const [loadingIngest, setLoadingIngest] = useState(false);
  const { toast } = useToast();

  // Handle file or paste
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

  // Parse raw text
  const parseBudget = async () => {
    setLoadingParse(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Authentication required');
      const res = await fetch('/api/budget/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ raw }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setItems(json.items);
    } catch (err: any) {
      toast({ title: 'Parse error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingParse(false);
    }
  };

  // Ingest parsed items
  const ingestBudget = async () => {
    setLoadingIngest(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Authentication required');
      const res = await fetch('/api/budget/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast({ title: 'Ingested', description: `Inserted ${json.inserted.length} items` });
      setItems([]);
      setRaw('');
    } catch (err: any) {
      toast({ title: 'Ingest error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingIngest(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Upload Budget</h1>
      <div className="space-y-2">
        <input type="file" accept=".csv,.xlsx,.txt" onChange={handleFileChange} />
        <textarea
          className="w-full h-32 border rounded p-2"
          value={raw}
          onChange={e => setRaw(e.target.value)}
          placeholder="Or paste raw data here"
        />
        <button
          className="px-4 py-2 bg-indigo-600 text-white rounded"
          onClick={parseBudget}
          disabled={!raw || loadingParse}
        >
          {loadingParse ? 'Parsing...' : 'Parse'}
        </button>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Preview</h2>
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-left">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-1">Period</th>
                  <th className="px-2 py-1">Memo</th>
                  <th className="px-2 py-1">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-2 py-1">{it.period}</td>
                    <td className="px-2 py-1">{it.memo}</td>
                    <td className="px-2 py-1">{it.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="px-4 py-2 bg-green-600 text-white rounded"
            onClick={ingestBudget}
            disabled={loadingIngest}
          >
            {loadingIngest ? 'Uploading...' : 'Upload to Vector DB'}
          </button>
        </div>
      )}
    </div>
  );
}
