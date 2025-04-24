# TODO: Implement Excel Formatting in excelUtils.ts

This outlines the steps to implement cell formatting and column width adjustments in `processExcelOperation` within `/frontend/src/lib/excelUtils.ts`.

## 1. Column Width Adjustment (`setColumnWidth` operation)

-   **Goal:** Adjust the width of specific columns in the generated Excel sheet.
-   **Method:** Use the `!cols` property of the worksheet object (`ws`). This property is an array of `ColInfo` objects.
-   **Implementation Steps:**
    1.  **Store Width Data:** When encountering a `setColumnWidth` operation during processing, store the `column` identifier (e.g., 'A', 'B' or 0, 1) and the desired `width` in a temporary structure keyed by sheet name (similar to how `formatsToApply` was considered). The `wch` property (width in characters) is generally recommended.
        ```typescript
        // Example structure
        const colWidthsToApply: { [sheetName: string]: { colIndex: number; width: number }[] } = {};
        
        // Inside the loop processing operations:
        case 'setColumnWidth':
          const colIndex = /* Convert op.column ('A', 'B') to 0-based index */;
          if (!colWidthsToApply[currentSheetName]) {
            colWidthsToApply[currentSheetName] = [];
          }
          colWidthsToApply[currentSheetName].push({ colIndex, width: op.width }); 
          break;
        ```
    2.  **Apply Widths After Sheet Creation:** After creating a worksheet (`ws = XLSX.utils.aoa_to_sheet(...)`) but *before* appending it to the workbook, check if there are stored widths for the `currentSheetName`.
    3.  If widths exist, create or update the `ws['!cols']` array. Each element corresponds to a column (0-indexed). Set the `wch` property for the relevant columns.
        ```typescript
        // After ws = XLSX.utils.aoa_to_sheet(...)
        if (colWidthsToApply[currentSheetName]) {
          if (!ws['!cols']) ws['!cols'] = [];
          colWidthsToApply[currentSheetName].forEach(({ colIndex, width }) => {
            // Ensure the array is long enough
            while (ws['!cols'].length <= colIndex) {
              ws['!cols'].push({}); 
            }
            ws['!cols'][colIndex] = { wch: width }; // Use 'wch' for character width
          });
        }
        XLSX.utils.book_append_sheet(workbook, ws, currentSheetName);
        ```
    4.  **Helper for Column Conversion:** Create a small utility function to convert Excel column letters ('A', 'B', 'AA') to 0-based indices (0, 1, 26).

## 2. Cell Formatting (`formatCell` operation)

-   **Goal:** Apply styles (font, fill, border, number format, alignment) to specific cells.
-   **Method:** The standard SheetJS Community edition has limited styling support. Forks like **`xlsx-js-style`** (e.g., from `gitbrent`) are commonly used to add this functionality. This involves adding a style object (`s`) to the cell object within the worksheet.
-   **Prerequisites:**
    *   Replace the standard `xlsx` dependency with `xlsx-js-style`.
        ```bash
        npm uninstall xlsx
        npm install xlsx-js-style 
        # or
        yarn remove xlsx
        yarn add xlsx-js-style
        ```
    *   Update the import: `import * as XLSX from 'xlsx-js-style';`
-   **Implementation Steps:**
    1.  **Store Format Data:** When encountering a `formatCell` operation, store the `cell` address (e.g., 'A1'), the `format` details, and the `sheetName` in a temporary structure.
        ```typescript
        // Example structure
        interface CellFormatInfo {
          sheet: string;
          cell: string; // e.g., 'A1', 'B5'
          format: any; // Define a more specific type based on xlsx-js-style options
        }
        const formatsToApply: CellFormatInfo[] = [];

        // Inside the loop processing operations:
        case 'formatCell':
           formatsToApply.push({ sheet: currentSheetName, cell: op.cell, format: op.format });
           break;
        ```
    2.  **Apply Formats After Sheet Creation:** After creating a worksheet (`ws = XLSX.utils.aoa_to_sheet(...)`), iterate through the `formatsToApply` array for the `currentSheetName`.
    3.  For each format instruction:
        *   Find the target cell object in the worksheet (`ws[cellAddress]`). If the cell doesn't exist (e.g., it was empty), you might need to create a placeholder cell object (`{ t: 'z', v: undefined }` - type 'z' for blank).
        *   Create a style object (`s`) based on the stored `format` details. `xlsx-js-style` defines the structure (e.g., `{ font: { bold: true }, fill: { fgColor: { rgb: "FFFF00" } }, numFmt: "0.00%" }`).
        *   Assign the style object to the cell: `ws[cellAddress].s = styleObject;`.
        ```typescript
        // After ws = XLSX.utils.aoa_to_sheet(...)
        formatsToApply.forEach(({ sheet, cell, format }) => {
           if (sheet === currentSheetName) {
             if (!ws[cell]) { 
               // Create blank cell if it doesn't exist
               ws[cell] = { t: 'z', v: undefined }; 
             }
             // --- Convert your 'format' object into xlsx-js-style 's' object ---
             const styleObject = { 
                 font: format.font, // Example: { name: 'Calibri', sz: 12, bold: true, color: { rgb: "FF0000" } }
                 fill: format.fill, // Example: { fgColor: { rgb: "FFFFCC00" } }
                 border: format.border, // Example: { top: { style: "thin", color: { auto: 1 } } }
                 alignment: format.alignment, // Example: { vertical: "center", horizontal: "center" }
                 numFmt: format.numFmt // Example: "0.00%" , "m/d/yy"
             };
             // --- (End conversion logic) ---

             ws[cell].s = styleObject;
           }
        }); 
        XLSX.utils.book_append_sheet(workbook, ws, currentSheetName);
        ```
    4.  **Define Format Structure:** Define the structure of your `op.format` object passed into `processExcelOperation` to align with the style options supported by `xlsx-js-style` (font, fill, border, alignment, numFmt).

## 3. Refinement

-   Review the implementation for edge cases (e.g., empty sheets, missing cells).
-   Ensure the conversion from your operation format to the SheetJS/`xlsx-js-style` format is correct.
-   Add error handling for potential issues during parsing or applying formats/widths.
