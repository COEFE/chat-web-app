"use client";

import { useState } from "react";
import { Search, MessageSquare, BrainCircuit } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface AIChatLinkProps {
  className?: string;
}

export function AIChatLink({ className }: AIChatLinkProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    // Navigate to chat page with the search query as a parameter
    router.push(`/dashboard?query=${encodeURIComponent(searchQuery)}`);
  };

  const placeholderQueries = [
    "Show my latest transactions",
    "Find journal entries for rent",
    "What did I spend on utilities last month?",
  ];

  // Randomly select a placeholder from the list
  const placeholderQuery = placeholderQueries[Math.floor(Math.random() * placeholderQueries.length)];

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-grow">
          <BrainCircuit className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={placeholderQuery}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-16 w-full"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">
            <Button 
              type="submit" 
              variant="ghost" 
              size="sm" 
              className="h-7 gap-1 text-xs"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Ask AI
            </Button>
          </div>
        </div>
      </form>
      <p className="text-xs text-muted-foreground">
        Ask questions about your transactions and the AI assistant will help you find answers
      </p>
    </div>
  );
}
