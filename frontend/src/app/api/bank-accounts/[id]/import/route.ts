import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query, transaction } from '@/lib/db';
import { parse as csvParse } from 'csv-parse/sync';

// POST /api/bank-accounts/[id]/import - Import bank transactions from CSV
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Extract bank account ID from URL
    const pathParts = req.nextUrl.pathname.split('/');
    const bankAccountId = parseInt(pathParts[pathParts.indexOf('bank-accounts') + 1], 10);
    
    if (isNaN(bankAccountId)) {
      return NextResponse.json({ error: 'Invalid bank account ID' }, { status: 400 });
    }

    // Check if bank account exists
    const bankAccountCheck = await query(
      'SELECT id FROM bank_accounts WHERE id = $1 AND is_deleted = false',
      [bankAccountId]
    );
    
    if (bankAccountCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }
    
    // Get the formData with the CSV file
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const mappingData = formData.get('mapping') as string;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Parse the mapping from JSON string to object
    let mapping;
    try {
      mapping = mappingData ? JSON.parse(mappingData) : null;
    } catch (e) {
      return NextResponse.json({ error: 'Invalid mapping format' }, { status: 400 });
    }
    
    // Read file content
    const csvText = await file.text();
    
    // Default column mappings if not provided
    const defaultMapping = {
      date: 'date',
      description: 'description',
      amount: 'amount',
      type: 'type', // credit/debit
      reference: 'reference'
    };
    
    const fieldMapping = mapping || defaultMapping;
    
    // Parse CSV with headers
    let records;
    try {
      records = csvParse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch (e) {
      return NextResponse.json({ 
        error: 'Failed to parse CSV file', 
        details: e instanceof Error ? e.message : 'Unknown error'
      }, { status: 400 });
    }
    
    if (!records || records.length === 0) {
      return NextResponse.json({ error: 'No records found in CSV file' }, { status: 400 });
    }
    
    // Create an import batch record
    const importBatchQuery = `
      INSERT INTO import_batches (
        bank_account_id,
        file_name,
        record_count,
        imported_by,
        status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    
    const importBatchResult = await query(importBatchQuery, [
      bankAccountId,
      file.name,
      records.length,
      userId,
      'processing'
    ]);
    
    const importBatchId = importBatchResult.rows[0].id;
    
    // Begin transaction for importing transactions
    await query('BEGIN');
    
    try {
      // Process each record and insert into bank_transactions
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        
        try {
          // Extract and transform data based on mapping
          const transactionDate = record[fieldMapping.date];
          const description = record[fieldMapping.description] || 'No description';
          
          // Parse amount and type (could be combined in one field or separate)
          let amount = 0;
          let transactionType = 'debit';
          
          if (fieldMapping.type && record[fieldMapping.type]) {
            // If type is explicitly provided
            const typeValue = record[fieldMapping.type].toLowerCase();
            transactionType = typeValue.includes('credit') || 
                             typeValue.includes('deposit') || 
                             typeValue === 'cr' ? 'credit' : 'debit';
            
            // Parse amount with potential currency symbols
            const amountStr = record[fieldMapping.amount].replace(/[$,]/g, '');
            amount = Math.abs(parseFloat(amountStr));
          } else {
            // Type is determined by amount sign
            const amountStr = record[fieldMapping.amount].replace(/[$,]/g, '');
            const parsedAmount = parseFloat(amountStr);
            
            if (isNaN(parsedAmount)) {
              throw new Error(`Invalid amount format: ${record[fieldMapping.amount]}`);
            }
            
            amount = Math.abs(parsedAmount);
            transactionType = parsedAmount < 0 ? 'debit' : 'credit';
          }
          
          // Get reference number if available
          const reference = fieldMapping.reference ? record[fieldMapping.reference] : null;
          
          // Insert transaction
          const insertQuery = `
            INSERT INTO bank_transactions (
              bank_account_id,
              transaction_date,
              description,
              amount,
              transaction_type,
              status,
              reference_number,
              import_batch_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `;
          
          await query(insertQuery, [
            bankAccountId,
            new Date(transactionDate),
            description,
            amount,
            transactionType,
            'unmatched',
            reference,
            importBatchId
          ]);
          
          successCount++;
        } catch (err) {
          errorCount++;
          errors.push({
            row: i + 1,
            error: err instanceof Error ? err.message : 'Unknown error',
            record
          });
          
          // Continue with next record
          continue;
        }
      }
      
      // Update import batch with results
      const updateBatchQuery = `
        UPDATE import_batches
        SET 
          success_count = $1,
          error_count = $2,
          status = $3,
          completed_at = CURRENT_TIMESTAMP,
          error_details = $4
        WHERE id = $5
      `;
      
      await query(updateBatchQuery, [
        successCount,
        errorCount,
        errorCount > 0 ? 'completed_with_errors' : 'completed',
        errors.length > 0 ? JSON.stringify(errors) : null,
        importBatchId
      ]);
      
      // Commit transaction
      await query('COMMIT');
      
      return NextResponse.json({
        message: 'Transactions imported successfully',
        importBatchId,
        totalRecords: records.length,
        successCount,
        errorCount,
        errors: errors.length > 0 ? errors : null
      });
    } catch (err) {
      // Rollback transaction
      await query('ROLLBACK');
      
      console.error('Error importing transactions:', err);
      
      // Update import batch status to failed
      await query(
        'UPDATE import_batches SET status = $1, error_details = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['failed', JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), importBatchId]
      );
      
      return NextResponse.json({ 
        error: 'Failed to import transactions', 
        details: err instanceof Error ? err.message : 'Unknown error'
      }, { status: 500 });
    }
  } catch (err) {
    console.error('Error processing import request:', err);
    return NextResponse.json({ 
      error: 'Failed to process import request', 
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 });
  }
}
