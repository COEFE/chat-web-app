"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { JournalType } from "@/lib/accounting/journalQueries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoIcon } from "lucide-react";

interface JournalTypeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function JournalTypeSelector({ 
  value, 
  onChange,
  disabled = false 
}: JournalTypeSelectorProps) {
  const [journalTypes, setJournalTypes] = useState<JournalType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const fetchJournalTypes = async () => {
      try {
        setIsLoading(true);
        
        // Get auth token from Firebase Auth
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          console.log('User not logged in, using fallback journal types');
          // Instead of throwing an error, use the fallback types
          setJournalTypes([
            { code: 'GJ', name: 'General Journal', description: 'For general accounting entries', requires_approval: false },
            { code: 'AP', name: 'Accounts Payable', description: 'For vendor bills and payments', requires_approval: false },
            { code: 'AR', name: 'Accounts Receivable', description: 'For customer invoices and payments', requires_approval: false },
            { code: 'ADJ', name: 'Adjusting Entries', description: 'For period-end adjustments', requires_approval: false }
          ]);
          setIsLoading(false);
          return; // Exit early
        }
        
        let token;
        try {
          token = await user.getIdToken();
        } catch (error) {
          console.error('Error getting auth token:', error);
          // Use fallback types on token error
          setJournalTypes([
            { code: 'GJ', name: 'General Journal', description: 'For general accounting entries', requires_approval: false },
            { code: 'AP', name: 'Accounts Payable', description: 'For vendor bills and payments', requires_approval: false },
            { code: 'AR', name: 'Accounts Receivable', description: 'For customer invoices and payments', requires_approval: false },
            { code: 'ADJ', name: 'Adjusting Entries', description: 'For period-end adjustments', requires_approval: false }
          ]);
          setIsLoading(false);
          return; // Exit early
        }
        
        // Try to get journal types from regular endpoint with auth token
        let response = await fetch('/api/journals?types=true', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        // If that fails, go straight to fallback types
        if (!response.ok) {
          console.log('Journal types not found, using fallback types');
          throw new Error('Journal types endpoint returned error');
        }
        
        const data = await response.json();
        setJournalTypes(data);
      } catch (error) {
        console.error('Error fetching journal types:', error);
        // Fallback to default journal types if fetch fails
        setJournalTypes([
          { code: 'GJ', name: 'General Journal', description: 'For general accounting entries', requires_approval: false },
          { code: 'AP', name: 'Accounts Payable', description: 'For vendor bills and payments', requires_approval: false },
          { code: 'AR', name: 'Accounts Receivable', description: 'For customer invoices and payments', requires_approval: false },
          { code: 'ADJ', name: 'Adjusting Entries', description: 'For period-end adjustments', requires_approval: false }
        ]);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchJournalTypes();
  }, []);
  
  return (
    <div className="flex items-center space-x-2">
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Select Journal Type" />
        </SelectTrigger>
        <SelectContent>
          {journalTypes.map((type) => (
            <SelectItem key={type.code} value={type.code}>
              <div className="flex items-center justify-between w-full">
                <span>{type.name}</span>
                <span className="text-xs text-muted-foreground ml-2">[{type.code}]</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {value && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              {journalTypes.find(t => t.code === value)?.description || 'No description available'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
