export interface BillCreditLine {
  id?: number;
  bill_credit_id?: number;
  expense_account_id: number | string;
  description?: string;
  quantity: number | string;
  unit_price: number | string;
  amount: number | string;
  category?: string;
  location?: string;
  funder?: string;
  created_at?: string;
  updated_at?: string;
  expense_account_name?: string;
}

export interface BillCredit {
  id?: number;
  vendor_id: number;
  vendor_name?: string;
  credit_number?: string;
  credit_date: string;
  due_date?: string;
  total_amount: number;
  status: string;
  terms?: string;
  memo?: string;
  ap_account_id: number;
  ap_account_name?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  lines?: BillCreditLine[];
}

export interface BillCreditWithVendor extends BillCredit {
  vendor_name: string;
}

export interface BillCreditWithDetails extends BillCredit {
  vendor_name: string;
  lines: BillCreditLine[];
}
