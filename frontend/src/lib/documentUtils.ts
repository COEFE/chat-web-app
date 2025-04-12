import { File as GoogleCloudFile } from "@google-cloud/storage";
import { extractText } from "unpdf";
import * as XLSX from "xlsx";

/**
 * Extracts and processes content from a document file based on its content type
 * @param file The Google Cloud Storage file object
 * @param contentType The MIME type of the file
 * @param activeSheet Optional active sheet name for Excel files
 * @returns Processed text content from the file
 */
export async function processDocumentContent(
  file: GoogleCloudFile,
  contentType: string,
  activeSheet?: string | null
): Promise<string> {
  try {
    // Download the file content
    const [contentBuffer] = await file.download();
    console.log(`Successfully downloaded ${contentBuffer.byteLength} bytes from storage.`);

    // Process based on content type
    if (contentType?.startsWith("text/")) {
      // Handle text files
      const textContent = contentBuffer.toString("utf-8");
      console.log(`Parsed text content, length: ${textContent.length}`);
      return textContent;
    } else if (contentType === "application/pdf") {
      // Handle PDF files
      console.log("Attempting to parse PDF content...");
      try {
        // unpdf requires Uint8Array, not Node.js Buffer
        // Convert Buffer to Uint8Array
        const uint8Array = new Uint8Array(contentBuffer);
        const result = await extractText(uint8Array);

        // extractText returns an object with totalPages and text (string array)
        if (result && Array.isArray(result.text)) {
          // Join all pages together with double newlines between pages
          const pdfContent = result.text.join("\n\n");
          console.log(`Successfully parsed PDF content with unpdf, length: ${pdfContent.length}`);
          return pdfContent;
        } else {
          return "[Error: Unexpected format from PDF extractor]";
        }
      } catch (extractError) {
        console.error("Error extracting PDF text:", extractError);
        return `[Error extracting PDF text: ${
          extractError instanceof Error ? extractError.message : "Unknown error"
        }]`;
      }
    } else if (
      contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || // .xlsx
      contentType === "application/vnd.ms-excel" || // .xls
      contentType === "text/csv" // .csv
    ) {
      // Handle Excel files
      console.log("Attempting to parse Excel/CSV content...");
      try {
        // Process Excel file using SheetJS
        const workbook = XLSX.read(contentBuffer, {
          type: "buffer",
          sheetStubs: true,
        });

        // Create a text representation of all sheets
        let excelContent: string[] = [];

        workbook.SheetNames.forEach((sheetName) => {
          // Skip sheets that don't match activeSheet if it's specified
          if (activeSheet && sheetName !== activeSheet) {
            return;
          }

          const worksheet = workbook.Sheets[sheetName];

          // Get the range of the worksheet
          const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");

          // Fill in any missing cells in the worksheet
          for (let r = range.s.r; r <= range.e.r; ++r) {
            for (let c = range.s.c; c <= range.e.c; ++c) {
              const cellAddress = XLSX.utils.encode_cell({ r, c });
              if (!worksheet[cellAddress]) {
                // Add empty cell
                worksheet[cellAddress] = { t: "s", v: "" };
              }
            }
          }

          // Convert to JSON with header: 1 option to preserve row structure
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "",
          }) as any[][];

          // Create a more structured text representation with column letters and row numbers
          let sheetContent = `Sheet: ${sheetName}\n\n`;

          // Add column headers (A, B, C, etc.)
          let headerRow = "    | ";
          for (let c = range.s.c; c <= range.e.c; ++c) {
            const colLetter = XLSX.utils.encode_col(c);
            headerRow += ` ${colLetter.padEnd(10)} |`;
          }
          sheetContent += headerRow + "\n";

          // Add separator row
          let separatorRow = "----|";
          for (let c = range.s.c; c <= range.e.c; ++c) {
            separatorRow += "------------|";
          }
          sheetContent += separatorRow + "\n";

          // Add data rows with row numbers
          for (let r = 0; r < jsonData.length; r++) {
            const rowNum = r + 1; // 1-based row numbers like in Excel
            let rowContent = `${String(rowNum).padStart(3)} | `;

            const row = jsonData[r];
            for (let c = 0; c < (row?.length || 0); c++) {
              const cellValue = row?.[c] || "";
              // Truncate long cell values and ensure proper padding
              const displayValue = String(cellValue)
                .substring(0, 10)
                .padEnd(10);
              rowContent += ` ${displayValue} |`;
            }

            sheetContent += rowContent + "\n";
          }

          // Add raw data representation for accurate cell lookup
          sheetContent += "\nRaw Data (for accurate cell lookup):\n";
          for (let r = 0; r < jsonData.length; r++) {
            const rowNum = r + 1; // 1-based row numbers
            const row = jsonData[r];

            for (let c = 0; c < (row?.length || 0); c++) {
              const colLetter = XLSX.utils.encode_col(c);
              const cellValue = row?.[c];
              if (cellValue !== "") {
                // Only include non-empty cells
                sheetContent += `Cell ${colLetter}${rowNum}: ${cellValue}\n`;
              }
            }
          }

          excelContent.push(sheetContent);
        });

        // Join all sheets with clear separation
        const combinedExcelContent = excelContent.join("\n\n---\n\n");
        console.log(`Successfully parsed Excel content, length: ${combinedExcelContent.length}`);
        return combinedExcelContent;
      } catch (excelError) {
        console.error("Error extracting Excel content:", excelError);
        return `[Error extracting Excel content: ${
          excelError instanceof Error ? excelError.message : "Unknown error"
        }]`;
      }
    } else {
      // Basic handling for other file types
      return `[Content of type ${contentType}, length ${contentBuffer.byteLength} bytes - needs specific parsing]`;
    }
  } catch (error) {
    console.error("Error processing document content:", error);
    return `[Error processing document: ${
      error instanceof Error ? error.message : "Unknown error"
    }]`;
  }
}
