import * as XLSX from 'xlsx';

/**
 * Convert Excel file from base64 to a formatted text table representation
 * @param base64Data Base64 encoded Excel file
 * @param fileName Original filename (for logging)
 * @returns Formatted string representation of the Excel file contents
 */
export async function parseExcelToText(base64Data: string, fileName: string): Promise<string> {
  try {
    console.log(`[ExcelParser] Starting to parse Excel file: ${fileName}`);
    
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return `Unable to parse "${fileName}" as an Excel file. The file may be corrupt or empty.`;
    }
    
    // Extract data from sheets
    let textContent = `# Excel Spreadsheet: ${fileName}\n\n`;
    
    // Track total sheets for logging
    const totalSheets = workbook.SheetNames.length;
    console.log(`[ExcelParser] Found ${totalSheets} sheets in the workbook`);
    
    for (const sheetName of workbook.SheetNames) {
      try {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        if (!data || data.length === 0) {
          textContent += `## Sheet: "${sheetName}"\n\nThis sheet is empty.\n\n`;
          continue;
        }
        
        // Add sheet header
        textContent += `## Sheet: "${sheetName}"\n\n`;
        
        // Format as a markdown table
        textContent += formatAsMarkdownTable(data);
        textContent += "\n\n";
        
      } catch (sheetError) {
        console.error(`[ExcelParser] Error processing sheet "${sheetName}":`, sheetError);
        textContent += `## Sheet: "${sheetName}"\n\nError processing this sheet.\n\n`;
      }
    }
    
    // Add summary
    textContent += `## Summary\n\nThis Excel file contains ${totalSheets} sheet(s).\n\n`;
    
    console.log(`[ExcelParser] Successfully parsed Excel file: ${fileName}`);
    return textContent;
    
  } catch (error: unknown) {
    console.error(`[ExcelParser] Error parsing Excel file:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return `Failed to parse "${fileName}" as an Excel file. Error: ${errorMessage}`;
  }
}

/**
 * Format a 2D array of data as a markdown table
 * @param data 2D array representing rows and columns of data
 * @returns Formatted markdown table
 */
function formatAsMarkdownTable(data: unknown[]): string {
  if (!data || data.length === 0) {
    return "No data available in this sheet.";
  }
  
  // Get a reasonable subset if the data is large
  const MAX_ROWS = 100;
  const MAX_COLS = 20;
  
  const rowCount = Math.min(data.length, MAX_ROWS);
  
  // Safely cast data to handle typescript checking
  const typedData = data as any[][];
  
  // Check if there's any data after limiting the rows
  if (rowCount === 0) {
    return "No data available in this sheet.";
  }
  
  // Determine columns - use the first row as header, or first 20 columns if available
  let headers = typedData[0] || [];
  let useFirstRowAsHeader = true;
  
  // If headers are all empty, generate numbered headers
  if (headers.every(h => h === undefined || h === null || h === '')) {
    useFirstRowAsHeader = false;
    headers = Array(Math.max(...typedData.map(row => (row as any[]).length || 0))).fill(0).map((_, i) => `Column ${i+1}`);
  }
  
  // Limit columns to MAX_COLS
  headers = headers.slice(0, MAX_COLS);
  
  // Start building the markdown table
  let table = '';
  
  // Add headers
  table += '| ' + headers.map(h => String(h || '').replace(/\|/g, '\\|')).join(' | ') + ' |\n';
  
  // Add separator
  table += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
  
  // Add data rows, starting from index 1 if first row is header
  const startRow = useFirstRowAsHeader ? 1 : 0;
  for (let i = startRow; i < rowCount; i++) {
    const row = typedData[i] || [];
    table += '| ' + headers.map((_, j) => {
      const cell = row[j] === undefined ? '' : String(row[j]).replace(/\|/g, '\\|');
      return cell.length > 50 ? cell.substring(0, 47) + '...' : cell;
    }).join(' | ') + ' |\n';
  }
  
  // Add note if data was truncated
  if (typedData.length > MAX_ROWS) {
    table += `\n*Note: Table truncated. Showing ${MAX_ROWS} rows out of ${typedData.length} total rows.*\n`;
  }
  
  if (headers.length === MAX_COLS && typedData[0] && (typedData[0] as any[]).length > MAX_COLS) {
    table += `\n*Note: Table width truncated. Showing ${MAX_COLS} columns out of ${(typedData[0] as any[]).length} total columns.*\n`;
  }
  
  return table;
}

/**
 * Determine if a file is an Excel file based on name and type
 * @param fileName File name
 * @param fileType MIME type of the file
 * @returns Boolean indicating if the file is an Excel file
 */
export function isExcelFile(fileName: string, fileType: string): boolean {
  // Check by extension
  const ext = fileName.split('.').pop()?.toLowerCase();
  const isExcelExtension = ['xlsx', 'xls', 'xlsm', 'xlsb', 'csv'].includes(ext || '');
  
  // Check by MIME type
  const isExcelMime = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    'text/csv'
  ].includes(fileType);
  
  return isExcelExtension || isExcelMime;
}
