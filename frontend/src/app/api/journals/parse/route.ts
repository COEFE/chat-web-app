import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createEmbedding } from '@/lib/embeddings';

// Schema for column mappings
const mappingsSchema = z.object({
  date: z.string(),
  memo: z.string(),
  account: z.string(),
  debit: z.string().optional(),
  credit: z.string().optional(),
  description: z.string().optional(),
});

// Schema for the request body
const requestSchema = z.object({
  data: z.array(z.record(z.string(), z.any())),
  mappings: mappingsSchema,
});

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const user = await auth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { data, mappings } = validationResult.data;
    
    if (data.length === 0) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 });
    }
    
    // Validate that either debit or credit mapping is provided
    if (!mappings.debit && !mappings.credit) {
      return NextResponse.json(
        { error: 'Either debit or credit column mapping is required' },
        { status: 400 }
      );
    }
    
    // Fetch all accounts for validation and matching
    const { rows: accounts } = await sql`
      SELECT id, code, name FROM accounts WHERE is_deleted = FALSE
    `;
    
    const accountMap = new Map();
    accounts.forEach(account => {
      accountMap.set(account.code.toLowerCase(), account);
      accountMap.set(account.name.toLowerCase(), account);
    });
    
    // Process data and create journal entries
    const processedData = await processJournalData(data, mappings, accountMap, user.email);
    
    return NextResponse.json(processedData, { status: 200 });
  } catch (error) {
    console.error('Error processing journal data:', error);
    return NextResponse.json(
      { error: 'Failed to process journal data', details: (error as Error).message },
      { status: 500 }
    );
  }
}

async function processJournalData(
  data: Record<string, any>[],
  mappings: z.infer<typeof mappingsSchema>,
  accountMap: Map<string, any>,
  userEmail: string
) {
  // Group data by date and memo to create journal entries
  const journalGroups = new Map<string, any[]>();
  
  // Create embeddings for deduplication
  const rowEmbeddings: { id: string; embedding: number[]; rowIndex: number }[] = [];
  
  // Process each row
  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];
    
    // Extract values using mappings
    const dateValue = row[mappings.date];
    const memoValue = row[mappings.memo];
    const accountValue = row[mappings.account];
    const debitValue = mappings.debit ? row[mappings.debit] : null;
    const creditValue = mappings.credit ? row[mappings.credit] : null;
    const descriptionValue = mappings.description ? row[mappings.description] : null;
    
    // Skip rows with missing required values
    if (!dateValue || !memoValue || !accountValue || (!debitValue && !creditValue)) {
      continue;
    }
    
    // Parse date
    let parsedDate;
    try {
      // Try to parse various date formats
      if (typeof dateValue === 'string') {
        // Handle string date formats
        parsedDate = new Date(dateValue);
      } else if (dateValue instanceof Date) {
        // Handle Excel date objects
        parsedDate = dateValue;
      } else {
        // Skip invalid dates
        continue;
      }
      
      // Validate the parsed date
      if (isNaN(parsedDate.getTime())) {
        continue;
      }
    } catch (error) {
      // Skip rows with invalid dates
      continue;
    }
    
    // Format date as ISO string (YYYY-MM-DD)
    const formattedDate = parsedDate.toISOString().split('T')[0];
    
    // Parse numeric values
    let debit = 0;
    let credit = 0;
    
    if (debitValue !== null && debitValue !== undefined && debitValue !== '') {
      debit = parseFloat(String(debitValue).replace(/[^0-9.-]+/g, ''));
      if (isNaN(debit)) debit = 0;
    }
    
    if (creditValue !== null && creditValue !== undefined && creditValue !== '') {
      credit = parseFloat(String(creditValue).replace(/[^0-9.-]+/g, ''));
      if (isNaN(credit)) credit = 0;
    }
    
    // Skip rows with zero amounts
    if (debit === 0 && credit === 0) {
      continue;
    }
    
    // Find matching account
    const accountKey = String(accountValue).toLowerCase();
    const account = accountMap.get(accountKey);
    
    if (!account) {
      // Skip rows with invalid accounts
      continue;
    }
    
    // Create a unique key for grouping
    const groupKey = `${formattedDate}|${memoValue}`;
    
    // Create or update journal group
    if (!journalGroups.has(groupKey)) {
      journalGroups.set(groupKey, []);
    }
    
    // Add line to journal group
    journalGroups.get(groupKey)?.push({
      account_id: account.id,
      account_code: account.code,
      account_name: account.name,
      debit: debit,
      credit: credit,
      description: descriptionValue || '',
    });
    
    // Generate embedding for deduplication
    const rowContent = `${dateValue} ${memoValue} ${accountValue} ${debitValue || ''} ${creditValue || ''} ${descriptionValue || ''}`;
    const rowId = uuidv4();
    
    try {
      const embedding = await createEmbedding(rowContent);
      rowEmbeddings.push({
        id: rowId,
        embedding,
        rowIndex
      });
    } catch (error) {
      console.error('Error creating embedding:', error);
      // Continue without embedding if there's an error
    }
  }
  
  // Deduplicate rows using vector similarity
  const uniqueRows = new Set<number>();
  const duplicateRows = new Set<number>();
  
  // Compare embeddings for similarity
  for (let i = 0; i < rowEmbeddings.length; i++) {
    if (duplicateRows.has(rowEmbeddings[i].rowIndex)) {
      continue;
    }
    
    uniqueRows.add(rowEmbeddings[i].rowIndex);
    
    for (let j = i + 1; j < rowEmbeddings.length; j++) {
      if (duplicateRows.has(rowEmbeddings[j].rowIndex)) {
        continue;
      }
      
      const similarity = cosineSimilarity(
        rowEmbeddings[i].embedding,
        rowEmbeddings[j].embedding
      );
      
      // If similarity is above threshold, mark as duplicate
      if (similarity > 0.95) {
        duplicateRows.add(rowEmbeddings[j].rowIndex);
      }
    }
  }
  
  // Create journal entries
  const journalEntries = [];
  let totalLineCount = 0;
  
  for (const [groupKey, lines] of journalGroups.entries()) {
    const [date, memo] = groupKey.split('|');
    
    // Validate that debits equal credits
    let totalDebit = 0;
    let totalCredit = 0;
    
    lines.forEach(line => {
      totalDebit += line.debit;
      totalCredit += line.credit;
    });
    
    // Skip unbalanced journal entries
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      continue;
    }
    
    // Create journal entry
    try {
      const { rows } = await sql`
        INSERT INTO journals (date, memo, source, created_by, is_posted)
        VALUES (${date}, ${memo}, 'Import', ${userEmail}, FALSE)
        RETURNING id
      `;
      
      const journalId = rows[0].id;
      
      // Create journal lines
      for (const line of lines) {
        await sql`
          INSERT INTO journal_lines (
            journal_id, account_id, debit, credit, description
          )
          VALUES (
            ${journalId},
            ${line.account_id},
            ${line.debit},
            ${line.credit},
            ${line.description || null}
          )
        `;
      }
      
      journalEntries.push({
        id: journalId,
        date,
        memo,
        lineCount: lines.length
      });
      
      totalLineCount += lines.length;
    } catch (error) {
      console.error('Error creating journal entry:', error);
      // Continue to next journal entry
    }
  }
  
  return {
    journalCount: journalEntries.length,
    lineCount: totalLineCount,
    journals: journalEntries,
    uniqueRowCount: uniqueRows.size,
    duplicateRowCount: duplicateRows.size
  };
}

// Helper function to calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
