"use client";

import React, { useState, useEffect } from "react";
import { auth } from "@/lib/firebaseConfig";
import { Search, X, BrainCircuit, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { EmbeddingSetup } from "./EmbeddingSetup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Types for AI search results
interface JournalLineResult {
  id: number;
  account_id: number;
  account_name: string;
  account_code: string;
  description: string;
  debit: number;
  credit: number;
}

interface JournalResult {
  id: number;
  journal_date: string;
  memo: string;
  journal_type: string;
  source: string;
  created_at: string;
  is_posted: boolean;
  lines: JournalLineResult[];
  similarity: number;
  similarity_score: number;
}

interface SearchResults {
  query: string;
  results: JournalResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  message?: string;
  hasNoEmbeddings?: boolean;
}

export function SemanticJournalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 5; // Results per page
  
  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Get current Firebase user
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error('You must be logged in to search journals');
      }
      
      // Get fresh ID token from Firebase
      const authToken = await user.getIdToken(true);
      
      const response = await fetch(`/api/journals/search?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to search journals');
      }
      
      const data = await response.json();
      setResults(data);
    } catch (err: any) {
      console.error('Error searching journals:', err);
      setError(err.message || 'An error occurred while searching');
    } finally {
      setLoading(false);
    }
  };
  
  const handleClear = () => {
    setQuery("");
    setResults(null);
    setError(null);
    setPage(0);
  };
  
  const handleChangePage = (newPage: number) => {
    setPage(newPage);
    // Re-run the search with the new page
    if (query) {
      setLoading(true);
      
      // Get current Firebase user
      const user = auth.currentUser;
      
      if (!user) {
        setError('You must be logged in to search journals');
        setLoading(false);
        return;
      }
      
      // Get fresh ID token from Firebase
      user.getIdToken(true).then(authToken => {
        fetch(`/api/journals/search?query=${encodeURIComponent(query)}&page=${newPage}&limit=${limit}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        })
          .then(response => {
            if (!response.ok) throw new Error('Failed to load page');
            return response.json();
          })
          .then(data => setResults(data))
          .catch(err => setError(err.message))
          .finally(() => setLoading(false));
      }).catch(err => {
        setError('Failed to get authentication token: ' + err.message);
        setLoading(false);
      });
    }
  };
  
  // Format currency amounts
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };
  
  // Calculate similarity percentage for display
  const getSimilarityPercent = (similarity: number) => {
    return Math.round(similarity * 100);
  };
  
  // Determine color based on similarity
  const getSimilarityColor = (similarity: number) => {
    if (similarity > 0.8) return "bg-green-100 text-green-800";
    if (similarity > 0.6) return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <div className="relative flex-grow">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search similar transactions..."
            className="pl-8"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
          />
          {query && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Clear</span>
            </Button>
          )}
        </div>
        <Button 
          onClick={handleSearch} 
          disabled={loading || !query.trim()}
          className="flex items-center space-x-2"
        >
          <BrainCircuit className="h-4 w-4 mr-1" />
          <span>AI Search</span>
        </Button>
      </div>

      {loading && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Skeleton className="h-4 w-32" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="w-full">
              <CardHeader className="p-4 pb-2">
                <Skeleton className="h-5 w-3/4" />
                <div className="flex justify-between mt-1">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, j) => (
                    <div key={j} className="grid grid-cols-4 gap-2">
                      <Skeleton className="h-4 col-span-2" />
                      <Skeleton className="h-4 col-span-1" />
                      <Skeleton className="h-4 col-span-1" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-md">
          <div className="text-red-800 font-medium">Error searching journal entries</div>
          <div className="text-red-600 text-sm mt-1">{error}</div>
        </div>
      )}
      
      {results && (
        <>
          {results.hasNoEmbeddings ? (
            <Tabs defaultValue="info">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="info">
                  <BrainCircuit className="h-4 w-4 mr-2" />
                  Information
                </TabsTrigger>
                <TabsTrigger value="setup">
                  <Settings2 className="h-4 w-4 mr-2" />
                  Setup
                </TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="mt-4">
                <div className="p-6 border rounded-lg bg-muted/50">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <BrainCircuit className="h-5 w-5 text-primary" /> 
                    No transactions with AI embeddings
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">{results.message}</p>
                  <p className="text-sm">
                    To start using AI search:
                  </p>
                  <ol className="list-decimal ml-5 mt-2">
                    <li>Create new journal entries in the system</li>
                    <li>Post those entries to generate embeddings automatically</li>
                    <li>Click the Setup tab to generate embeddings for existing entries</li>
                    <li>Return here to search using natural language</li>
                  </ol>
                </div>
              </TabsContent>
              <TabsContent value="setup" className="mt-4">
                <EmbeddingSetup />
              </TabsContent>
            </Tabs>
          ) : results.results.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Found {results.pagination.total} transaction{results.pagination.total !== 1 ? "s" : ""} related to{" "}
                <span className="font-medium">"{results.query}"</span>
              </p>
              {results.results.map((journal) => (
                <Card key={journal.id} className="w-full overflow-hidden">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex justify-between">
                      <CardTitle className="text-base">
                        {journal.memo}
                      </CardTitle>
                      <Badge 
                        className={getSimilarityColor(journal.similarity)}
                      >
                        {getSimilarityPercent(journal.similarity)}% match
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{journal.journal_date}</span>
                      <span className="uppercase text-xs">{journal.journal_type}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="w-1/2">Account / Description</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {journal.lines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell className="py-2">
                              <div className="font-medium">{line.account_name}</div>
                              <div className="text-sm text-muted-foreground">{line.description}</div>
                            </TableCell>
                            <TableCell className="text-right py-2">
                              {line.debit > 0 ? formatAmount(line.debit) : ""}
                            </TableCell>
                            <TableCell className="text-right py-2">
                              {line.credit > 0 ? formatAmount(line.credit) : ""}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
              
              {results.pagination.totalPages > 1 && (
                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        href="#" 
                        onClick={(e) => {
                          e.preventDefault();
                          if (page > 0) handleChangePage(page - 1);
                        }}
                        className={page === 0 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    
                    {Array.from({ length: Math.min(5, results.pagination.totalPages) }).map((_, i) => {
                      const pageNum = i;
                      return (
                        <PaginationItem key={i}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              handleChangePage(pageNum);
                            }}
                            isActive={pageNum === page}
                          >
                            {pageNum + 1}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    
                    {results.pagination.totalPages > 5 && (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    )}
                    
                    <PaginationItem>
                      <PaginationNext 
                        href="#" 
                        onClick={(e) => {
                          e.preventDefault();
                          if (page < results.pagination.totalPages - 1) handleChangePage(page + 1);
                        }}
                        className={page >= results.pagination.totalPages - 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No matching transactions found
            </div>
          )}
        </>
      )}
    </div>
  );
}
