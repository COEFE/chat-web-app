import * as db from '@/lib/db';

export interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  shipping_address?: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  user_id?: string; // User ID for data isolation
}

/**
 * Retrieve customers from the database with optional filtering
 */
export async function getCustomers(options?: {
  isDeleted?: boolean;
  limit?: number;
  userId?: string; // Add user_id for data isolation
}): Promise<Customer[]> {
  try {
    const { isDeleted = false, limit = 100, userId } = options || {};
    
    let query = `
      SELECT * FROM customers
      WHERE is_deleted = $1
    `;
    
    const queryParams: any[] = [isDeleted];
    
    // Add user_id filter if provided (for proper data isolation)
    if (userId) {
      query += ` AND user_id = $${queryParams.length + 1}`;
      // Add userId as a string parameter
      queryParams.push(userId.toString());
    }
    
    query += `
      ORDER BY name
      LIMIT $${queryParams.length + 1}
    `;
    queryParams.push(limit);
    
    const result = await db.query(query, queryParams);
    return result.rows as Customer[];
  } catch (error) {
    console.error("[CustomerQueries] Error fetching customers:", error);
    return [];
  }
}

/**
 * Retrieve a single customer by ID
 */
export async function getCustomerById(id: number, userId?: string): Promise<Customer | null> {
  try {
    let query = `
      SELECT * FROM customers
      WHERE id = $1 AND is_deleted = false
    `;
    
    // Add user_id filter if provided (for proper data isolation)
    if (userId) {
      query = query.replace('WHERE id = $1', 'WHERE id = $1 AND user_id = $2');
    }
    
    const queryParams: any[] = [typeof id === 'string' ? parseInt(id) : id];
    if (userId) queryParams.push(userId.toString());
    
    const result = await db.query(query, queryParams);
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0] as Customer;
  } catch (error) {
    console.error("[CustomerQueries] Error fetching customer by ID:", error);
    return null;
  }
}

/**
 * Create a new customer in the database
 * @param customerData Customer data to create
 * @returns The ID of the created customer
 */
export async function createCustomer(customerData: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'is_deleted'>, userId?: string): Promise<number | null> {
  try {
    const { name, email, phone, billing_address, shipping_address } = customerData;
    
    // Basic validation - only email is required
    if (!email || email.trim() === '') {
      throw new Error('Customer email is required');
    }
    
    // Generate a name if not provided
    const customerName = name && name.trim() !== '' ? name : `Customer ${email.split('@')[0]}`;
    
    const query = `
      INSERT INTO customers (
        name, 
        email, 
        phone, 
        billing_address, 
        shipping_address, 
        created_at, 
        updated_at, 
        is_deleted,
        user_id
      ) 
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), false, $6)
      RETURNING id
    `;
    
    const result = await db.query(query, [
      customerName,
      email,
      phone || null,
      billing_address || null,
      shipping_address || null,
      userId || null // Include user_id for proper data isolation
    ]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0].id;
  } catch (error) {
    console.error('[CustomerQueries] Error creating customer:', error);
    throw error;
  }
}
