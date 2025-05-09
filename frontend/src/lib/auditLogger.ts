// frontend/src/lib/auditLogger.ts
// Note: Audit logging should only be used in API routes or server components
// This ensures access to environment variables for database connections

import { query } from './db';

/**
 * Defines the structure for an audit log entry.
 * Based on audittrailtodo.md section 2.
 */
export interface AuditLogData {
  timestamp: string; // ISO 8601 format
  user_id: string | null; // Can be null for system actions or unauthenticated actions
  user_name?: string | null; // Optional, for readability
  action_type: string; // e.g., BILL_CREATED, USER_LOGIN
  entity_type?: string | null; // e.g., Bill, User
  entity_id?: string | number | null; // ID of the affected entity
  changes_made?: {
    field: string;
    old_value: any;
    new_value: any;
  }[] | null; // Array of changes or a more structured diff
  source_ip?: string | null;
  status: 'SUCCESS' | 'FAILURE' | 'ATTEMPT';
  error_details?: string | null;
  context?: Record<string, any> | null; // Additional contextual info
}

// Track if the audit_logs table exists and has been checked
let auditTableExists = false;
let checkingAuditTable = false;

/**
 * Safe database query that won't throw exceptions
 * @param text SQL query to execute
 * @param params Parameters for the query
 * @returns Query result or null if there was an error
 */
async function safeQuery(text: string, params: any[] = []) {
  try {
    return await query(text, params);
  } catch (error) {
    console.warn('Database query failed:', error);
    return null;
  }
}

/**
 * Checks if the audit_logs table exists in the database
 * @returns Promise that resolves to true if the table exists, false otherwise
 */
async function checkAuditLogsTableExists(): Promise<boolean> {
  if (auditTableExists || checkingAuditTable) {
    return auditTableExists;
  }
  
  checkingAuditTable = true;
  try {
    const checkTableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'audit_logs'
      ) as table_exists
    `;
    
    const result = await safeQuery(checkTableQuery);
    auditTableExists = result?.rows[0]?.table_exists || false;
    return auditTableExists;
  } catch (error) {
    console.warn('Failed to check if audit_logs table exists:', error);
    return false;
  } finally {
    checkingAuditTable = false;
  }
}

/**
 * Stores an audit log entry in the database.
 * This function will not throw errors to avoid disrupting application flow.
 * 
 * @param data - The audit log entry to store
 * @returns Promise that resolves when the operation is complete
 */
async function storeAuditLog(data: AuditLogData): Promise<void> {
  try {
    // Check if the audit_logs table exists first
    const tableExists = await checkAuditLogsTableExists();
    if (!tableExists) {
      console.warn('audit_logs table does not exist - skipping database logging');
      console.warn('Please run the 026_create_audit_logs_table.sql migration');
      return;
    }
    
    const insertQuery = `
      INSERT INTO audit_logs (
        timestamp, user_id, user_name, action_type, entity_type, entity_id,
        changes_made, source_ip, status, error_details, context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    await safeQuery(insertQuery, [
      data.timestamp,
      data.user_id,
      data.user_name || null,
      data.action_type,
      data.entity_type || null,
      data.entity_id ? String(data.entity_id) : null,
      data.changes_made ? JSON.stringify(data.changes_made) : null,
      data.source_ip || null,
      data.status,
      data.error_details || null,
      data.context ? JSON.stringify(data.context) : null
    ]);
  } catch (error) {
    // Log the error but don't throw - we don't want audit logging to break the application
    console.error('Failed to store audit log:', error);
    console.error('Audit log data:', JSON.stringify(data, null, 2));
  }
}

/**
 * Logs an audit event to the console and attempts to store it in the database.
 * If database storage fails, the function will log the error but not throw,
 * to prevent audit logging from disrupting normal application flow.
 *
 * @param data - The audit log data to record.
 */
export async function logAuditEvent(data: AuditLogData): Promise<void> {
  // Ensure timestamp is always present
  const logEntry = {
    ...data,
    timestamp: data.timestamp || new Date().toISOString(),
  };

  // Log to console for immediate visibility during development
  console.log('AUDIT_EVENT:', JSON.stringify(logEntry, null, 2));

  // Check if we're in a server context (API route or server component)
  // This is a simple heuristic - if we're running on the client side,
  // we'll only log to console and not attempt database storage
  const isServerContext = typeof window === 'undefined';
  
  if (isServerContext) {
    // Store in database asynchronously - only in server contexts
    // We don't await here to prevent blocking the main application flow
    // This is intentional to optimize performance as per audit requirements
    storeAuditLog(logEntry).catch(err => {
      console.error('Background audit log storage failed:', err);
    });
  } else {
    console.log('Audit logging to database skipped in client context');
  }
}

/**
 * Retrieves audit logs with filtering and pagination.
 * This is useful for admin interfaces and reporting.
 *
 * @param filters Filtering options
 * @param page Page number (1-based)
 * @param limit Number of logs per page
 * @returns Paginated audit logs and total count
 */
export async function getAuditLogs({
  userId,
  actionType,
  entityType,
  entityId,
  startDate,
  endDate,
  status,
  page = 1,
  limit = 50
}: {
  userId?: string;
  actionType?: string;
  entityType?: string;
  entityId?: string | number;
  startDate?: string;
  endDate?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ logs: any[]; total: number }> {
  try {
    // Check if the audit_logs table exists first
    const tableExists = await checkAuditLogsTableExists();
    if (!tableExists) {
      console.warn('audit_logs table does not exist - returning empty result');
      console.warn('Please run the 026_create_audit_logs_table.sql migration');
      return { logs: [], total: 0 };
    }
    
    // Build the where clause based on provided filters
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (actionType) {
      conditions.push(`action_type = $${paramIndex++}`);
      params.push(actionType);
    }

    if (entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(entityType);
    }

    if (entityId) {
      conditions.push(`entity_id = $${paramIndex++}`);
      params.push(String(entityId));
    }

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total logs matching the filters
    const countQuery = `
      SELECT COUNT(*) FROM audit_logs ${whereClause}
    `;
    const countResult = await safeQuery(countQuery, params);
    const total = parseInt(countResult?.rows?.[0]?.count || '0', 10);

    // Calculate pagination offsets
    const offset = (page - 1) * limit;
    const paginationParams = [...params, limit, offset];

    // Query logs with pagination
    const logsQuery = `
      SELECT * FROM audit_logs 
      ${whereClause} 
      ORDER BY timestamp DESC 
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    const logsResult = await safeQuery(logsQuery, paginationParams);
    
    if (!logsResult || !logsResult.rows) {
      return { logs: [], total: 0 };
    }
    
    // Parse JSON fields for each log
    const logs = logsResult?.rows?.map(log => ({
      ...log,
      changes_made: log.changes_made ? JSON.parse(log.changes_made) : null,
      context: log.context ? JSON.parse(log.context) : null,
    })) || [];

    return { logs, total };
  } catch (error) {
    console.error('Error retrieving audit logs:', error);
    // Instead of throwing, return empty results
    return { logs: [], total: 0 };
  }
}

// Example Usage (for demonstration purposes, remove later):
/*
logAuditEvent({
  timestamp: new Date().toISOString(),
  user_id: 'user123',
  user_name: 'john.doe@example.com',
  action_type: 'EXAMPLE_ACTION',
  entity_type: 'ExampleEntity',
  entity_id: 'entity789',
  status: 'SUCCESS',
  context: {
    requestId: 'req-abc-123',
  },
});
*/
