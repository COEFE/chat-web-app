import { createVendor, getVendorByName } from "./accounting/vendorQueries";
import { createBill } from "./accounting/billQueries";
import { logAuditEvent } from "./auditLogger";
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
            // Log the raw row data to help with debugging
            console.log(`[ExcelDataProcessor] Processing row:`, JSON.stringify(row));
            
            // Extract vendor and bill data from the row
            const vendorData = extractVendorData(row);
            if (!vendorData.name) {
              const error = `Skipped row: Missing vendor name`;
              console.error(`[ExcelDataProcessor] ${error}`);
              errors.push(error);
              continue;
            }
            
            // Check if vendor exists, create if not
            let vendorId: number;
            try {
              const existingVendor = await getVendorByName(vendorData.name);
              if (existingVendor && existingVendor.id) {
                vendorId = existingVendor.id;
                console.log(`[ExcelDataProcessor] Using existing vendor: ${vendorData.name} (ID: ${vendorId})`);
              } else {
                // Create new vendor
                console.log(`[ExcelDataProcessor] Creating new vendor:`, vendorData);
                
                const newVendor = await createVendor({
                  name: vendorData.name,
                  contact_person: vendorData.contact_person || '',
                  email: vendorData.email || '',
                  phone: vendorData.phone || '',
                  address: vendorData.address || ''
                });
                
                console.log(`[ExcelDataProcessor] Vendor created:`, newVendor);
                
                if (!newVendor || !newVendor.id) {
                  throw new Error(`Failed to create vendor: ${vendorData.name}`);
                }
                
                // Log vendor creation
                await logAuditEvent({
                  user_id: userId,
                  action_type: "VENDOR_CREATION",
                  entity_type: "VENDOR",
                  entity_id: String(newVendor.id),
                  context: { source: "excel_import", vendorData },
                  status: "SUCCESS",
                  timestamp: new Date().toISOString()
                });
                
                vendorId = newVendor.id;
                createdVendors.push(newVendor);
              }
              
              // Extract bill data
              const billData = extractBillData(row, vendorId);
              if (!billData.bill_number) {
                const error = `Skipped bill for ${vendorData.name}: Missing bill number`;
                console.error(`[ExcelDataProcessor] ${error}`);
                errors.push(error);
                continue;
              }
              
              // Create the bill
              console.log(`[ExcelDataProcessor] Creating bill:`, billData);
              
              // Convert our line items to match the BillLine interface
              const formattedLines = (billData.lines || []).map(line => ({
                description: line.description || '',
                expense_account_id: String(line.expense_account_id || '2000'), // Default to expense account 2000
                quantity: '1', // Default quantity
                unit_price: String(line.amount || 0), // Use the amount as unit price
                amount: String(line.amount || 0), // Amount as string
                category: '',
                location: '',
                funder: ''
              }));
              
              // Create bill record
              const newBill = await createBill({
                vendor_id: vendorId,
                bill_number: billData.bill_number,
                bill_date: billData.bill_date,
                due_date: billData.due_date,
                total_amount: billData.total_amount,
                memo: billData.memo || '',
                status: 'draft',
                // Add default AP account ID (required)
                ap_account_id: 1000 // Use a default AP account ID or extract from data
              }, formattedLines);
              
              console.log(`[ExcelDataProcessor] Bill created:`, newBill);
              
              if (!newBill || !newBill.id) {
                throw new Error(`Failed to create bill: ${billData.bill_number}`);
              }
              
              // Log bill creation
              await logAuditEvent({
                user_id: userId,
                action_type: "BILL_CREATION",
                entity_type: "BILL",
                entity_id: String(newBill.id),
                context: { source: "excel_import", billData },
                status: "SUCCESS",
                timestamp: new Date().toISOString()
              });
              
              createdBills.push(newBill);
              console.log(`[ExcelDataProcessor] Created bill: ${billData.bill_number} for vendor ${vendorData.name}`);
            } catch (dbError) {
              const errorMsg = `Database error while processing vendor/bill: ${dbError instanceof Error ? dbError.message : String(dbError)}`;
              console.error(`[ExcelDataProcessor] ${errorMsg}`);
              errors.push(errorMsg);
            }
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
  const nameFields = ['vendor_name', 'vendor', 'name', 'supplier_name', 'supplier', 'Vendor', 'Vendor Name', 'VENDOR', 'VENDOR_NAME'];
  const contactFields = ['contact_person', 'contact', 'vendor_contact', 'Contact Person', 'Contact', 'CONTACT'];
  const emailFields = ['email', 'vendor_email', 'contact_email', 'Email', 'EMAIL'];
  const phoneFields = ['phone', 'phone_number', 'contact_phone', 'telephone', 'Phone', 'Phone Number', 'PHONE'];
  const addressFields = ['address', 'vendor_address', 'billing_address', 'Address', 'ADDRESS'];
  
  // Log what fields we found
  console.log('[ExcelDataProcessor] Vendor data extraction - available fields:', Object.keys(row).join(', '));
  
  // Get vendor name - try to be very forgiving in how we locate it
  let vendorName = getFirstDefinedValue(row, nameFields);
  
  // If we still don't have a vendor name, try the first column
  if (!vendorName && Object.keys(row).length > 0) {
    const firstKey = Object.keys(row)[0];
    console.log(`[ExcelDataProcessor] Falling back to first column for vendor name: ${firstKey} = ${row[firstKey]}`);
    vendorName = row[firstKey];
  }
  
  const result = {
    name: vendorName || '',
    contact_person: getFirstDefinedValue(row, contactFields),
    email: getFirstDefinedValue(row, emailFields),
    phone: getFirstDefinedValue(row, phoneFields),
    address: getFirstDefinedValue(row, addressFields)
  };
  
  console.log(`[ExcelDataProcessor] Extracted vendor data:`, result);
  return result;
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
    expense_account_id?: number | string;
    quantity?: number;
    unit_price?: number;
  }>;
} {
  // Log available fields for debugging
  console.log('[ExcelDataProcessor] Bill data extraction - available fields:', Object.keys(row).join(', '));
  
  // Handle different possible column names with case variations
  const billNumberFields = [
    'bill_number', 'invoice_number', 'reference', 'bill_ref', 
    'Bill Number', 'Invoice Number', 'Reference', 'Bill Ref',
    'BILL_NUMBER', 'INVOICE_NUMBER', 'REFERENCE', 'Bill #', 'Invoice #'
  ];
  
  const billDateFields = [
    'bill_date', 'invoice_date', 'date', 
    'Bill Date', 'Invoice Date', 'Date', 
    'BILL_DATE', 'INVOICE_DATE', 'DATE'
  ];
  
  const dueDateFields = [
    'due_date', 'payment_due', 
    'Due Date', 'Payment Due', 
    'DUE_DATE', 'PAYMENT_DUE'
  ];
  
  const amountFields = [
    'total_amount', 'amount', 'total', 'bill_amount', 
    'Total Amount', 'Amount', 'Total', 'Bill Amount',
    'TOTAL_AMOUNT', 'AMOUNT', 'TOTAL', 'BILL_AMOUNT'
  ];
  
  const memoFields = [
    'memo', 'description', 'notes', 
    'Memo', 'Description', 'Notes',
    'MEMO', 'DESCRIPTION', 'NOTES'
  ];
  
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
      console.log(`[ExcelDataProcessor] Found value for ${key}: ${obj[key]}`);
      return obj[key];
    }
  }
  
  // Try case-insensitive match as a fallback
  const lowerCaseObj: Record<string, any> = {};
  for (const key in obj) {
    lowerCaseObj[key.toLowerCase()] = obj[key];
  }
  
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    if (lowerCaseObj[lowerKey] !== undefined) {
      console.log(`[ExcelDataProcessor] Found case-insensitive value for ${key}: ${lowerCaseObj[lowerKey]}`);
      return lowerCaseObj[lowerKey];
    }
  }
  
  return undefined;
}
