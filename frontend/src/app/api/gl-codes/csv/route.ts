import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx-js-style';
import { authenticateRequest } from '@/lib/authenticateRequest';

interface GLCode {
  code: string;
  description: string;
  notes?: string;
}

export async function POST(request: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(request);
  if (error) return error;

  try {
    console.log('[GL CSV API] Processing file upload for user:', userId);
    
    // Get the form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Check file type
    const fileType = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(fileType || '')) {
      return NextResponse.json({ 
        error: 'Invalid file type. Please upload a CSV or Excel file.' 
      }, { status: 400 });
    }

    // Read the file
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    // Get the first sheet
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON
    const data: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet);
    
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Empty file or invalid data format' }, { status: 400 });
    }
    
    console.log(`[GL CSV API] Found ${data.length} rows in the uploaded file`);

    // Extract GL codes
    const glCodes: GLCode[] = [];
    const errors: string[] = [];
    let rowNum = 2; // Start from row 2 (assuming row 1 is headers)
    
    for (const row of data) {
      // Determine column keys (could be different based on the file)
      const codeKey = findKey(row, ['code', 'gl_code', 'gl code', 'account', 'account code', 'account_code']);
      const descKey = findKey(row, ['description', 'desc', 'name', 'account name', 'account_name']);
      const notesKey = findKey(row, ['notes', 'note', 'comment', 'comments', 'additional', 'details']);
      
      if (!codeKey || !descKey) {
        errors.push(`Row ${rowNum}: Could not identify required columns for code and description`);
        rowNum++;
        continue;
      }
      
      const code = String(row[codeKey]).trim();
      const description = String(row[descKey]).trim();
      
      if (!code || !description) {
        errors.push(`Row ${rowNum}: Missing required values (code or description)`);
        rowNum++;
        continue;
      }
      
      const notes = notesKey ? String(row[notesKey] || '').trim() : undefined;
      
      glCodes.push({ code, description, notes });
      rowNum++;
    }
    
    if (glCodes.length === 0) {
      return NextResponse.json({ 
        error: 'No valid GL codes found in the file',
        details: errors 
      }, { status: 400 });
    }
    
    console.log(`[GL CSV API] Extracted ${glCodes.length} valid GL codes from file`);
    
    // Forward to the GL codes API
    const apiUrl = new URL(request.url);
    const baseUrl = `${apiUrl.protocol}//${apiUrl.host}`;
    const glCodesApiUrl = `${baseUrl}/api/gl-codes`;
    
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!idToken) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }
    
    try {
      const response = await fetch(glCodesApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ glCodes })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        return NextResponse.json({ 
          error: 'Error adding GL codes from file',
          details: result.error || 'Unknown error' 
        }, { status: response.status });
      }
      
      return NextResponse.json({
        success: true,
        message: `Successfully processed ${glCodes.length} GL codes`,
        warnings: errors.length > 0 ? errors : undefined,
        results: result.results
      });
    } catch (apiError) {
      console.error('[GL CSV API] Error calling GL codes API:', apiError);
      return NextResponse.json({ 
        error: 'Error adding GL codes from file',
        message: apiError instanceof Error ? apiError.message : 'Network or server error' 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[GL CSV API] Error processing file:', error);
    return NextResponse.json({ 
      error: 'Error processing file',
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

// Helper function to find a key in an object that matches any of the provided search terms
function findKey(obj: any, searchTerms: string[]): string | null {
  const keys = Object.keys(obj);
  for (const term of searchTerms) {
    const match = keys.find(key => key.toLowerCase() === term.toLowerCase());
    if (match) return match;
  }
  return null;
}
