import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { FileEdit } from "lucide-react";
import ReconciliationUpdateForm from './ReconciliationUpdateForm';

interface ReconciliationStatementEditProps {
  bankAccountId: string | number;
  sessionId: string | number;
  currentEndDate: string;
  currentBalance: number;
  onUpdated: (updatedValues: { end_date: string; bank_statement_balance: number }) => void;
}

export default function ReconciliationStatementEdit({
  bankAccountId,
  sessionId,
  currentEndDate,
  currentBalance,
  onUpdated
}: ReconciliationStatementEditProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        className="ml-2"
        onClick={() => setIsFormOpen(true)}
      >
        <FileEdit className="h-4 w-4 mr-1" /> Edit
      </Button>

      <ReconciliationUpdateForm 
        bankAccountId={bankAccountId}
        sessionId={sessionId}
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onUpdated={onUpdated}
        currentDetails={{
          end_date: currentEndDate,
          bank_statement_balance: currentBalance
        }}
      />
    </>
  );
}
