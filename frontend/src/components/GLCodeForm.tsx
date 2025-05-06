"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface GLCodeFormProps {
  onSuccess?: () => void;
}

export default function GLCodeForm({ onSuccess }: GLCodeFormProps) {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleCreate = async () => {
    if (!code.trim() || !description.trim()) {
      toast({ title: 'Missing fields', description: 'Code and description are required', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Authentication required');
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, name: description, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create account');
      toast({ title: 'Created', description: `${code} added successfully` });
      if (onSuccess) onSuccess();
      setCode('');
      setDescription('');
      setNotes('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="gl-code-input">GL Code</Label>
        <Input
          id="gl-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={isLoading}
        />
      </div>
      <div>
        <Label htmlFor="gl-description-input">Description</Label>
        <Input
          id="gl-description-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isLoading}
        />
      </div>
      <div>
        <Label htmlFor="gl-notes-input">Notes (optional)</Label>
        <Textarea
          id="gl-notes-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isLoading}
        />
      </div>
      <Button onClick={handleCreate} disabled={isLoading} className="w-full">
        {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Create Account'}
      </Button>
    </div>
  );
}
