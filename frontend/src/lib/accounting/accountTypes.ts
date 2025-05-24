export interface Account {
  id: number;
  name: string;
  account_number?: string;
  account_type: string;
  type?: string; // Added for compatibility with existing code
  description?: string;
  is_active?: boolean;
  parent_account_id?: number;
  balance?: number;
  created_at?: string;
  updated_at?: string;
}
