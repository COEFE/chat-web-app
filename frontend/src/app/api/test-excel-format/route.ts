import { NextRequest, NextResponse } from 'next/server';
import { processExcelOperation } from '@/lib/excelUtils';

// Simple test handler to verify the implementation of formatting in Excel
// Test using: GET /api/test-excel-format
export async function GET(req: NextRequest) {
  try {
    // Generate a unique test user ID (real app would use auth)
    const testUserId = 'test-user-' + Date.now().toString();
    
    // Create operations that include formatting and column width
    const operations = [
      {
        type: 'createSheet',
        name: 'Formatted Sheet'
      },
      {
        type: 'addRow',
        row: ['Header 1', 'Header 2', 'Header 3', 'Header 4']
      },
      {
        type: 'addRow',
        row: [100, 200, 300, 400]
      },
      {
        type: 'addRow',
        row: ['A', 'B', 'C', 'D']
      },
      // Format header row with bold text and background color
      {
        type: 'formatCell',
        cell: 'A1',
        format: {
          font: { bold: true, color: { rgb: "FF0000" } }, // Red text
          fill: { fgColor: { rgb: "FFFF00" } } // Yellow background
        }
      },
      {
        type: 'formatCell',
        cell: 'B1',
        format: {
          font: { bold: true, color: { rgb: "FF0000" } }, 
          fill: { fgColor: { rgb: "FFFF00" } }
        }
      },
      {
        type: 'formatCell',
        cell: 'C1',
        format: {
          font: { bold: true, color: { rgb: "FF0000" } }, 
          fill: { fgColor: { rgb: "FFFF00" } }
        }
      },
      {
        type: 'formatCell',
        cell: 'D1',
        format: {
          font: { bold: true, color: { rgb: "FF0000" } }, 
          fill: { fgColor: { rgb: "FFFF00" } }
        }
      },
      // Format numeric cells with number format
      {
        type: 'formatCell',
        cell: 'A2',
        format: {
          numFmt: "#,##0.00", // Number with 2 decimal places
          alignment: { horizontal: "right" }
        }
      },
      {
        type: 'formatCell',
        cell: 'B2',
        format: {
          numFmt: "0.00%", // Percentage format
          alignment: { horizontal: "right" }
        }
      },
      {
        type: 'formatCell',
        cell: 'C2',
        format: {
          numFmt: "$#,##0.00", // Currency format
          alignment: { horizontal: "right" }
        }
      },
      // Set column widths
      {
        type: 'setColumnWidth',
        column: 'A',
        width: 15
      },
      {
        type: 'setColumnWidth',
        column: 'B',
        width: 20
      },
      {
        type: 'setColumnWidth',
        column: 'C',
        width: 25
      }
    ];
    
    // Invoke the processExcelOperation function
    const result = await processExcelOperation(
      'createExcelFile',
      null, // No document ID (new file)
      operations,
      testUserId,
      'TestFormatting' // Base filename
    );
    
    return NextResponse.json({
      success: true,
      message: 'Test completed successfully',
      result,
    });
  } catch (error) {
    console.error('Error in test-excel-format:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
