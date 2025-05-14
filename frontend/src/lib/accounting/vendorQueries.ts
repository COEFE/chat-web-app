import { sql } from '@vercel/postgres';

/**
 * Interface for Vendor objects
 */
export interface Vendor {
  id?: number;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  default_expense_account_id?: number;
  created_at?: string;
  updated_at?: string;
  is_deleted?: boolean;
  deleted_at?: string;
}

/**
 * Get a list of vendors with optional filtering and pagination
 */
export async function getVendors(
  page: number = 1,
  limit: number = 50,
  search?: string,
  includeDeleted: boolean = false,
  userId?: string
): Promise<{ vendors: Vendor[], total: number }> {
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT 
      v.*,
      a.name as default_expense_account_name
    FROM vendors v
    LEFT JOIN accounts a ON v.default_expense_account_id = a.id
    WHERE 1=1
  `;
  
  const queryParams: any[] = [];
  let paramCount = 1;
  
  // Add search filter if provided
  if (search) {
    query += ` AND (
      v.name ILIKE $${paramCount} 
      OR v.contact_person ILIKE $${paramCount}
      OR v.email ILIKE $${paramCount}
      OR v.phone ILIKE $${paramCount}
    )`;
    queryParams.push(`%${search}%`);
    paramCount++;
  }
  
  // Filter out deleted vendors unless includeDeleted is true
  if (!includeDeleted) {
    query += ` AND v.is_deleted = FALSE`;
  }
  
  // Filter by user_id if provided
  if (userId) {
    query += ` AND v.user_id = $${paramCount}`;
    queryParams.push(userId);
    paramCount++;
  }
  
  // Get total count first
  // Build the count query with proper parameter indexing
  let countQueryText = 'SELECT COUNT(*) as total FROM vendors v WHERE 1=1';
  const countParams = [];
  let countParamIndex = 1;
  
  if (!includeDeleted) {
    countQueryText += ' AND v.is_deleted = FALSE';
  }
  
  if (search) {
    countQueryText += ` AND (
      v.name ILIKE $${countParamIndex} 
      OR v.contact_person ILIKE $${countParamIndex}
      OR v.email ILIKE $${countParamIndex}
      OR v.phone ILIKE $${countParamIndex}
    )`;
    countParams.push(`%${search}%`);
    countParamIndex++;
  }
  
  if (userId) {
    countQueryText += ` AND v.user_id = $${countParamIndex}`;
    countParams.push(userId);
    countParamIndex++;
  }
  
  const countQuery = countQueryText;
  
  const countResult = await sql.query(countQuery, countParams);
  const total = parseInt(countResult.rows[0].total, 10);
  
  // Add pagination
  query += ` ORDER BY v.name ASC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  queryParams.push(limit, offset);
  
  const result = await sql.query(query, queryParams);
  
  return {
    vendors: result.rows,
    total
  };
}

/**
 * Get a vendor by ID
 */
export async function getVendor(id: number, userId?: string): Promise<Vendor | null> {
  // Ensure we have a userId for proper data isolation
  if (!userId) {
    console.warn('[getVendor] No userId provided for vendor lookup, data isolation may be compromised');
    return null; // Return null if no userId to prevent data leakage
  }

  const query = `
    SELECT 
      v.*,
      a.name as default_expense_account_name
    FROM vendors v
    LEFT JOIN accounts a ON v.default_expense_account_id = a.id
    WHERE v.id = $1 AND v.is_deleted = false AND v.user_id = $2
  `;
  
  const result = await sql.query(query, [id, userId]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0];
}

/**
 * Get a vendor by name (case-insensitive exact match)
 */
export async function getVendorByName(name: string, userId?: string): Promise<Vendor | null> {
  // Ensure we have a userId for proper data isolation
  if (!userId) {
    console.warn('[getVendorByName] No userId provided for vendor lookup, data isolation may be compromised');
    return null; // Return null if no userId to prevent data leakage
  }

  const query = `
    SELECT *
    FROM vendors
    WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
      AND is_deleted = false
      AND user_id = $2
    LIMIT 1
  `;
  
  const params = [name, userId];
  
  const result = await sql.query(query, params);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
}

/**
 * Create a new vendor
 */
export async function createVendor(vendor: Vendor, userId?: string): Promise<Vendor> {
  const {
    name,
    contact_person,
    email,
    phone,
    address,
    default_expense_account_id
  } = vendor;
  
  const query = `
    INSERT INTO vendors (
      name,
      contact_person,
      email,
      phone,
      address,
      default_expense_account_id,
      user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  
  const result = await sql.query(query, [
    name,
    contact_person || null,
    email || null,
    phone || null,
    address || null,
    default_expense_account_id || null,
    userId || null // Include user_id for proper data isolation
  ]);
  
  return result.rows[0];
}

/**
 * Update an existing vendor
 */
export async function updateVendor(id: number, vendor: Partial<Vendor>): Promise<Vendor | null> {
  // First check if vendor exists
  const existingVendor = await getVendor(id);
  if (!existingVendor) {
    return null;
  }
  
  const {
    name,
    contact_person,
    email,
    phone,
    address,
    default_expense_account_id
  } = vendor;
  
  const query = `
    UPDATE vendors
    SET 
      name = COALESCE($1, name),
      contact_person = COALESCE($2, contact_person),
      email = COALESCE($3, email),
      phone = COALESCE($4, phone),
      address = COALESCE($5, address),
      default_expense_account_id = COALESCE($6, default_expense_account_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $7 AND is_deleted = false
    RETURNING *
  `;
  
  const result = await sql.query(query, [
    name || null,
    contact_person === undefined ? null : contact_person,
    email === undefined ? null : email,
    phone === undefined ? null : phone,
    address === undefined ? null : address,
    default_expense_account_id === undefined ? null : default_expense_account_id,
    id
  ]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0];
}

/**
 * Soft delete a vendor
 */
export async function deleteVendor(id: number): Promise<boolean> {
  // Check if vendor has any associated bills
  const billsQuery = `
    SELECT COUNT(*) as bill_count
    FROM bills
    WHERE vendor_id = $1 AND is_deleted = false
  `;
  
  const billsResult = await sql.query(billsQuery, [id]);
  const billCount = parseInt(billsResult.rows[0].bill_count, 10);
  
  if (billCount > 0) {
    // Vendor has associated bills, cannot delete
    throw new Error(`Cannot delete vendor with ID ${id} because it has ${billCount} associated bill(s)`);
  }
  
  // Soft delete the vendor
  const query = `
    UPDATE vendors
    SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND is_deleted = false
    RETURNING id
  `;
  
  const result = await sql.query(query, [id]);
  
  return result.rows.length > 0;
}
