/**
 * Shared types for accounting modules to avoid circular dependencies
 *
 * This file contains all shared types used across accounting modules to prevent
 * circular dependencies between files. All accounting-related interfaces should be
 * defined here rather than in individual files.
 */

/**
 * Interface for Bill objects
 */
export interface Bill {
  id?: number;
  vendor_id: number;
  bill_number?: string;
  bill_date: string;
  due_date: string;
  total_amount: number;
  amount_paid?: number;
  status?: string;
  terms?: string;
  memo?: string;
  ap_account_id: number;
  created_at?: string;
  updated_at?: string;
  is_deleted?: boolean;
  deleted_at?: string;
}

/**
 * Interface for Bill Payment objects
 */
export interface BillPayment {
  id?: number;
  bill_id: number;
  payment_date: string;
  amount_paid: number;
  payment_account_id: number;
  payment_method?: string;
  reference_number?: string;
  journal_id?: number;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Interface for Bill with Vendor information
 */
export interface BillWithVendor extends Bill {
  vendor_name?: string; 
  ap_account_name?: string;
}

/**
 * Interface for Bill Line objects
 */
export interface BillLine {
  id?: number;
  bill_id?: string;
  expense_account_id: string;
  description?: string;
  quantity: string;
  unit_price: string;
  amount: string;
  category?: string;
  location?: string;
  funder?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Interface for Bill Refund objects
 */
export interface BillRefund {
  id?: number;
  bill_id: number;
  refund_date: string;
  amount: number;
  refund_account_id: number;
  refund_method?: string;
  reference_number?: string;
  journal_id?: number;
  reason?: string;
  created_at?: string;
  updated_at?: string;
}
