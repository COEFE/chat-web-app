/**
 * Accounting System Type Definitions
 */

export interface Journal {
  id?: number;
  journal_date: string | Date; // Changed from transaction_date to journal_date to match database schema
  journal_number?: string;
  journal_type: string;
  reference_number?: string;
  memo: string;
  source?: string;
  created_by?: string;
  created_at?: string | Date;
  is_posted?: boolean;
  is_deleted?: boolean;
  lines: JournalLine[];
}

export interface JournalLine {
  id?: number;
  journal_id?: number;
  line_number?: number;
  account_id: number;
  description?: string;
  debit_amount: number;
  credit_amount: number;
  category?: string;
  location?: string;
  vendor?: string;
  funder?: string;
  embedding?: number[];
}

export interface Account {
  id: number;
  code: string;
  name: string;
  type?: string; 
  parent_id?: number;
  notes?: string;
  is_active?: boolean;
  is_custom?: boolean;
}

export interface JournalAudit {
  id: number;
  journal_id: number;
  action: 'POST' | 'UPDATE' | 'DELETE' | 'UNPOST';
  changed_by: string;
  changed_at: string | Date;
  before_state?: any;
  after_state?: any;
}

export type JournalType = {
  code: string;
  name: string;
  description?: string;
};

export interface Budget {
  id: number;
  account_id: number;
  period: string; // YYYY-MM format
  amount: number;
  memo?: string;
  created_by: string;
  created_at: string | Date;
}
