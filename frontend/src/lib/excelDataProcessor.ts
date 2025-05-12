import { createVendor, getVendorByName } from "./accounting/vendorQueries";
import { createBill } from "./accounting/billQueries";
import * as XLSX from 'xlsx';

/**
 * Process Excel data and extract vendor bill information
 * @param base64Data Base64 encoded Excel file data
 * @param fileName Original file name
 * @param userId User ID for audit logging
 * @returns Result of the processing operation
 */
export async function processVendorBillsFromExcel(
  base64Data: string, 
  fileName: string,
  userId: string
): Promise<{
  success: boolean;
  message: string;
  createdVendors: any[];
  createdBills: any[];
  errors: string[];
}> {
  try {
    console.log(`[ExcelDataProcessor] Processing vendor bills from Excel file: ${fileName}`);
    
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return {
        success: false,
        message: `Unable to parse "${fileName}" as an Excel file. The file may be corrupt or empty.`,
        createdVendors: [],
        createdBills: [],
        errors: ["Invalid Excel file format"]
      };
    }
    
    // Results tracking
    const createdVendors: any[] = [];
    const createdBills: any[] = [];
    const errors: string[] = [];
    
    // Process each sheet in the workbook
    for (const sheetName of workbook.SheetNames) {
      try {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);
        
        if (!data || data.length === 0) {
          console.log(`[ExcelDataProcessor] Sheet "${sheetName}" is empty`);
          continue;
        }
        
        console.log(`[ExcelDataProcessor] Processing ${data.length} rows from sheet "${sheetName}"`);
        
        // Process each row as a potential vendor bill
        for (const row of data) {
          try {
            // Extract vendor and bill data from the row
            // The exact field names will depend on the Excel format
            const vendorData = extractVendorData(row);
            if (!vendorData.name) {
              errors.push(`Skipped row: Missing vendor name`);
              continue;
            }
            
            // Check if vendor exists, create if not
            let vendorId: number;
            const existingVendor = await getVendorByName(vendorData.name);
            
            if (existingVendor) {
              vendorId = existingVendor.id;
              console.log(`[ExcelDataProcessor] Using existing vendor: ${vendorData.name} (ID: ${vendorId})`);
            } else {
              // Create new vendor
              const newVendor = await createVendor({
                name: vendorData.name,
                contact_person: vendorData.contact_person || '',
                email: vendorData.email || '',
                phone: vendorData.phone || '',
                address: vendorData.address || ''
              });
              
              vendorId = newVendor.id;
              createdVendors.push(newVendor);
              console.log(`[ExcelDataProcessor] Created new vendor: ${vendorData.name} (ID: ${vendorId})`);
            }
            
            // Extract bill data
            const billData = extractBillData(row, vendorId);
            if (!billData.bill_number) {
              errors.push(`Skipped bill for ${vendorData.name}: Missing bill number`);
              continue;
            }
            
            // Create the bill
            const newBill = await createBill({
              vendor_id: vendorId,
              bill_number: billData.bill_number,
              bill_date: billData.bill_date,
              due_date: billData.due_date,
              total_amount: billData.total_amount,
              memo: billData.memo || '',
              status: 'draft',
              lines: billData.lines || []
            });
            
            createdBills.push(newBill);
            console.log(`[ExcelDataProcessor] Created bill: ${billData.bill_number} for vendor ${vendorData.name}`);
            
          } catch (rowError) {
            console.error(`[ExcelDataProcessor] Error processing row:`, rowError);
            errors.push(`Error processing row: ${rowError instanceof Error ? rowError.message : String(rowError)}`);
          }
        }
        
      } catch (sheetError) {
        console.error(`[ExcelDataProcessor] Error processing sheet "${sheetName}":`, sheetError);
        errors.push(`Error processing sheet "${sheetName}": ${sheetError instanceof Error ? sheetError.message : String(sheetError)}`);
      }
    }
    
    // Generate result message
    let message = '';
    if (createdVendors.length > 0) {
      message += `Created ${createdVendors.length} new vendors. `;
    }
    if (createdBills.length > 0) {
      message += `Created ${createdBills.length} new bills. `;
    }
    if (errors.length > 0) {
      message += `Encountered ${errors.length} errors.`;
    }
    if (message === '') {
      message = 'No data was processed from the Excel file.';
    }
    
    return {
      success: createdBills.length > 0 || createdVendors.length > 0,
      message,
      createdVendors,
      createdBills,
      errors
    };
    
  } catch (error) {
    console.error(`[ExcelDataProcessor] Error processing Excel file:`, error);
    return {
      success: false,
      message: `Failed to process Excel file: ${error instanceof Error ? error.message : String(error)}`,
      createdVendors: [],
      createdBills: [],
      errors: [String(error)]
    };
  }
}

/**
 * Extract vendor data from an Excel row
 */
function extractVendorData(row: any): {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
} {
  // Handle different possible column names for vendor information
  const nameFields = ['vendor_name', 'vendor', 'name', 'supplier_name', 'supplier'];
  const contactFields = ['contact_person', 'contact', 'vendor_contact'];
  const emailFields = ['email', 'vendor_email', 'contact_email'];
  const phoneFields = ['phone', 'phone_number', 'contact_phone', 'telephone'];
  const addressFields = ['address', 'vendor_address', 'billing_address'];
  
  return {
    name: getFirstDefinedValue(row, nameFields) || '',
    contact_person: getFirstDefinedValue(row, contactFields),
    email: getFirstDefinedValue(row, emailFields),
    phone: getFirstDefinedValue(row, phoneFields),
    address: getFirstDefinedValue(row, addressFields)
  };
}

/**
 * Extract bill data from an Excel row
 */
function extractBillData(row: any, vendorId: number): {
  vendor_id: number;
  bill_number: string;
  bill_date: string;
  due_date: string;
  total_amount: number;
  memo?: string;
  lines?: Array<{
    description: string;
    amount: number;
    expense_account_id?: number;
  }>;
} {
  // Handle different possible column names
  const billNumberFields = ['bill_number', 'invoice_number', 'reference', 'bill_ref'];
  const billDateFields = ['bill_date', 'invoice_date', 'date'];
  const dueDateFields = ['due_date', 'payment_due'];
  const amountFields = ['total_amount', 'amount', 'total', 'bill_amount'];
  const memoFields = ['memo', 'description', 'notes'];
  
  // Get today's date as default in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  
  // Calculate a default due date (30 days from today)
  const defaultDueDate = new Date();
  defaultDueDate.setDate(defaultDueDate.getDate() + 30);
  const defaultDueDateStr = defaultDueDate.toISOString().split('T')[0];
  
  // Extract line items if available
  const lines: Array<{description: string, amount: number, expense_account_id?: number}> = [];
  
  // If we have line item data (highly dependent on Excel structure)
  if (row.line_items && Array.isArray(row.line_items)) {
    for (const item of row.line_items) {
      lines.push({
        description: item.description || 'No description',
        amount: parseFloat(item.amount) || 0,
        expense_account_id: item.account_id
      });
    }
  } else {
    // Create a single line item from the main row data
    const description = getFirstDefinedValue(row, ['item_description', 'line_description']) || 'General expense';
    const amountValue = getFirstDefinedValue(row, amountFields);
    const amount = typeof amountValue === 'number' ? amountValue : parseFloat(amountValue) || 0;
    
    if (amount > 0) {
      lines.push({
        description,
        amount
      });
    }
  }
  
  return {
    vendor_id: vendorId,
    bill_number: getFirstDefinedValue(row, billNumberFields) || `BILL-${Date.now()}`,
    bill_date: getFirstDefinedValue(row, billDateFields) || today,
    due_date: getFirstDefinedValue(row, dueDateFields) || defaultDueDateStr,
    total_amount: parseFloat(getFirstDefinedValue(row, amountFields) || '0'),
    memo: getFirstDefinedValue(row, memoFields),
    lines
  };
}

/**
 * Helper function to get the first defined value from an object using a list of possible keys
 */
function getFirstDefinedValue(obj: any, keys: string[]): any {
  for (const key of keys) {
    if (obj[key] !== undefined) {
      return obj[key];
    }
  }
  return undefined;
}
