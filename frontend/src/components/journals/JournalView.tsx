"use client";

import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { JournalEntry } from "./JournalTable";

interface JournalViewProps {
  journal: JournalEntry;
  onClose: () => void;
  onEdit?: () => void;
}

export function JournalView({ journal, onClose, onEdit }: JournalViewProps) {
  // Format date for display
  const formatDate = (date: string | Date) => {
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

  // Calculate totals
  const totalDebit = journal.lines?.reduce((sum, line) => sum + (line.debit || 0), 0) || 0;
  const totalCredit = journal.lines?.reduce((sum, line) => sum + (line.credit || 0), 0) || 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Journal Entry #{journal.id}</CardTitle>
            <CardDescription>
              Created by {journal.created_by} on{" "}
              {formatDate(journal.created_at)}
            </CardDescription>
          </div>
          <Badge
            variant={
              journal.is_deleted
                ? "destructive"
                : journal.is_posted
                ? "default"
                : "outline"
            }
          >
            {journal.is_deleted
              ? "Deleted"
              : journal.is_posted
              ? "Posted"
              : "Draft"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">
              Date
            </h4>
            <p>{formatDate(journal.date)}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">
              Memo
            </h4>
            <p>{journal.memo}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">
              Source
            </h4>
            <p>{journal.source || "—"}</p>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Journal Lines</h4>
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
              {journal.lines?.map((line) => (
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
                  {formatAmount(totalDebit)}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(totalCredit)}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        {onEdit && !journal.is_posted && !journal.is_deleted && (
          <Button onClick={onEdit}>Edit</Button>
        )}
      </CardFooter>
    </Card>
  );
}
