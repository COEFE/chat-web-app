"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { Eye, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface JournalLine {
  id: number;
  line_number?: number;
  journal_id?: number;
  account_id: number;
  account_code?: string;
  account_name?: string;
  debit: number;
  credit: number;
  description?: string;
  category?: string;
  location?: string;
  vendor?: string;
  funder?: string;
}

export interface JournalEntry {
  id: number;
  date?: string | Date;
  journal_date?: string | Date; // Added to support both field names
  memo: string;
  source?: string;
  created_by: string;
  created_at: string | Date;
  is_posted: boolean;
  is_deleted: boolean;
  total_amount?: number;
  total_debit?: number;
  total_credit?: number;
  lines?: JournalLine[];
}

interface JournalTableProps {
  journals: JournalEntry[];
  onView: (journal: JournalEntry) => void;
  onEdit: (journal: JournalEntry) => void;
  onDelete: (journal: JournalEntry) => void;
  onReverseEntry?: (journal: JournalEntry) => void;
  isLoading?: boolean;
}

export function JournalTable({
  journals,
  onView,
  onEdit,
  onDelete,
  onReverseEntry,
  isLoading = false,
}: JournalTableProps) {
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  // Toggle row expansion
  const toggleRowExpansion = (journalId: number) => {
    setExpandedRows((prev) => ({
      ...prev,
      [journalId]: !prev[journalId],
    }));
  };

  // Format date for display
  const formatDate = (date: string | Date | undefined) => {
    if (!date) return "N/A";
    try {
      return format(new Date(date), "MMM d, yyyy");
    } catch (e) {
      return "Invalid Date";
    }
  };

  // Format amount for display
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Journal #</TableHead>
            <TableHead>Memo</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8">
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              </TableCell>
            </TableRow>
          ) : journals.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8">
                No journal entries found
              </TableCell>
            </TableRow>
          ) : (
            journals.map((journal) => (
              <React.Fragment key={journal.id}>
                <TableRow className="hover:bg-muted/50">
                  <TableCell>
                    {journal.lines && journal.lines.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => toggleRowExpansion(journal.id)}
                      >
                        {expandedRows[journal.id] ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {formatDate(journal.journal_date)}
                  </TableCell>
                  <TableCell>{journal.id}</TableCell>
                  <TableCell>{journal.memo}</TableCell>
                  <TableCell>{journal.source || "—"}</TableCell>
                  <TableCell>
                    {formatAmount(journal.total_amount || 0)}
                  </TableCell>
                  <TableCell>
                    {journal.is_deleted ? (
                      <Badge variant="destructive">Deleted</Badge>
                    ) : journal.is_posted ? (
                      <Badge variant="default">Posted</Badge>
                    ) : (
                      <Badge variant="outline">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Actions
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="flex items-center"
                          onClick={() => onView(journal)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                        {!journal.is_posted && !journal.is_deleted && (
                          <DropdownMenuItem
                            className="flex items-center"
                            onClick={() => onEdit(journal)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {/* Show Reverse Entry option for posted journals */}
                        {journal.is_posted && !journal.is_deleted && onReverseEntry && (
                          <DropdownMenuItem
                            className="flex items-center"
                            onClick={() => onReverseEntry(journal)}
                          >
                            <svg
                              className="mr-2 h-4 w-4"
                              xmlns="http://www.w3.org/2000/svg"
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="m3 8 4-4 4 4" />
                              <path d="M7 4v9" />
                              <path d="m21 16-4 4-4-4" />
                              <path d="M17 20v-9" />
                              <path d="M15 7H8" />
                              <path d="M16 17H9" />
                            </svg>
                            Reverse Entry
                          </DropdownMenuItem>
                        )}
                        
                        {/* Only show Delete for non-posted journals */}
                        {!journal.is_posted && !journal.is_deleted && (
                          <DropdownMenuItem
                            className="flex items-center text-destructive"
                            onClick={() => onDelete(journal)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                {expandedRows[journal.id] && journal.lines && (
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={7} className="p-0">
                      <div className="px-4 py-2">
                        <h4 className="text-sm font-medium mb-2">
                          Journal Lines
                        </h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Account</TableHead>
                              <TableHead className="text-right">Debit</TableHead>
                              <TableHead className="text-right">Credit</TableHead>
                              <TableHead>Description</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {journal.lines.map((line) => (
                              <TableRow key={line.id}>
                                <TableCell>
                                  {line.account_code && line.account_name
                                    ? `${line.account_code} - ${line.account_name}`
                                    : `Account #${line.account_id}`}
                                </TableCell>
                                <TableCell className="text-right">
                                  {line.debit > 0 ? formatAmount(line.debit) : ""}
                                </TableCell>
                                <TableCell className="text-right">
                                  {line.credit > 0 ? formatAmount(line.credit) : ""}
                                </TableCell>
                                <TableCell>{line.description || "—"}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/50 font-medium">
                              <TableCell>Totals</TableCell>
                              <TableCell className="text-right">
                                {formatAmount(
                                  journal.lines.reduce(
                                    (sum, line) => sum + (line.debit || 0),
                                    0
                                  )
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatAmount(
                                  journal.lines.reduce(
                                    (sum, line) => sum + (line.credit || 0),
                                    0
                                  )
                                )}
                              </TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
