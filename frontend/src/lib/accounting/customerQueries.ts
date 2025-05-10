import * as db from '@/lib/db';

export interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  shipping_address?: string;
  tax_id?: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/**
 * Retrieve customers from the database with optional filtering
 */
export async function getCustomers(options?: {
  isDeleted?: boolean;
  limit?: number;
}): Promise<Customer[]> {
  try {
    const { isDeleted = false, limit = 100 } = options || {};
    
    const query = `
      SELECT * FROM customers
      WHERE is_deleted = $1
      ORDER BY name
      LIMIT $2
    `;
    
    const result = await db.query(query, [isDeleted, limit]);
    return result.rows as Customer[];
  } catch (error) {
    console.error("[CustomerQueries] Error fetching customers:", error);
    return [];
  }
}

/**
 * Retrieve a single customer by ID
 */
export async function getCustomerById(id: number): Promise<Customer | null> {
  try {
    const query = `
      SELECT * FROM customers
      WHERE id = $1 AND is_deleted = false
    `;
    
    const result = await db.query(query, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0] as Customer;
  } catch (error) {
    console.error("[CustomerQueries] Error fetching customer by ID:", error);
    return null;
  }
}
