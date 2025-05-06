import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// GET /api/journals/export - export journal entries to CSV
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const searchTerm = url.searchParams.get('searchTerm');
    const searchField = url.searchParams.get('searchField');

    // Build query with filters
    let query = `
      SELECT 
        j.id, 
        j.date, 
        j.memo, 
        j.source, 
        j.created_by, 
        j.created_at,
        j.is_posted,
        jl.id as line_id,
        jl.account_id,
        a.code as account_code,
        a.name as account_name,
        jl.debit,
        jl.credit,
        jl.description as line_description
      FROM 
        journals j
      JOIN 
        journal_lines jl ON j.id = jl.journal_id
      JOIN
        accounts a ON jl.account_id = a.id
      WHERE 
        j.is_deleted = FALSE
    `;
    
    const queryParams = [];
    let paramIndex = 1;
    
    if (startDate) {
      query += ` AND j.date >= $${paramIndex}`;
      queryParams.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND j.date <= $${paramIndex}`;
      queryParams.push(endDate);
      paramIndex++;
    }
    
    // Add search filter if provided
    if (searchTerm && searchField) {
      const validFields = ['memo', 'source', 'created_by'];
      if (validFields.includes(searchField)) {
        query += ` AND j.${searchField} ILIKE $${paramIndex}`;
        queryParams.push(`%${searchTerm}%`);
        paramIndex++;
      }
    }
    
    query += ` ORDER BY j.date DESC, j.id DESC, jl.id ASC`;
    
    // Execute query
    const { rows } = await sql.query(query, queryParams);
    
    // Transform data for CSV
    const csvData = transformToCSV(rows);
    
    // Set response headers for CSV download
    return new NextResponse(csvData, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="journal_entries_export.csv"`,
      },
    });
  } catch (err: any) {
    console.error('[journals/export] GET error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// Helper function to transform data to CSV format
function transformToCSV(data: any[]) {
  if (!data || data.length === 0) {
    // Return empty CSV with headers
    return 'Journal ID,Date,Memo,Source,Created By,Created At,Posted,Line ID,Account ID,Account Code,Account Name,Debit,Credit,Description\\n';
  }
  
  // Define CSV headers
  const headers = [
    'Journal ID',
    'Date',
    'Memo',
    'Source',
    'Created By',
    'Created At',
    'Posted',
    'Line ID',
    'Account ID',
    'Account Code',
    'Account Name',
    'Debit',
    'Credit',
    'Description'
  ];
  
  // Convert headers to CSV row
  const csvHeader = headers.join(',');
  
  // Convert data rows to CSV
  const csvRows = data.map(row => {
    // Format date fields
    const date = row.date ? new Date(row.date).toISOString().split('T')[0] : '';
    const createdAt = row.created_at ? new Date(row.created_at).toISOString() : '';
    
    // Escape fields that might contain commas or quotes
    const escapeCsvField = (field: any) => {
      if (field === null || field === undefined) return '';
      const stringField = String(field);
      if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\\n')) {
        return `"${stringField.replace(/"/g, '""')}"`;
      }
      return stringField;
    };
    
    // Map row data to CSV fields
    return [
      row.id,
      date,
      escapeCsvField(row.memo),
      escapeCsvField(row.source),
      escapeCsvField(row.created_by),
      createdAt,
      row.is_posted ? 'Yes' : 'No',
      row.line_id,
      row.account_id,
      escapeCsvField(row.account_code),
      escapeCsvField(row.account_name),
      row.debit || '0.00',
      row.credit || '0.00',
      escapeCsvField(row.line_description)
    ].join(',');
  });
  
  // Combine header and rows
  return `${csvHeader}\\n${csvRows.join('\\n')}`;
}
