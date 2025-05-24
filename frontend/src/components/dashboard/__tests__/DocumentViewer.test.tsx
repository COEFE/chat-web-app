// frontend/src/components/dashboard/__tests__/DocumentViewer.test.tsx
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import DocumentViewer from '../DocumentViewer'; // Adjust path if needed
import { MyDocumentData } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';

// --- Mocks ---
// Mock Firestore
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  Timestamp: {
    fromDate: (date: Date) => ({ // Simulate Firestore Timestamp structure
      toDate: () => date,
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: (date.getTime() % 1000) * 1e6,
    }),
  },
}));

// Mock AuthContext
jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock Mammoth (DOCX)
jest.mock('mammoth', () => ({
  convertToHtml: jest.fn().mockResolvedValue({ value: '<p>Mock DOCX content</p>' }),
}));

// Mock next/dynamic for PDFViewer
jest.mock('next/dynamic', () => () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFViewerMock = require('../__mocks__/PDFViewerMock').default;
  return PDFViewerMock;
});

// Mock XLSX library (for reading)
// We need to simulate the structure it returns
jest.mock('xlsx', () => ({
  read: jest.fn(),
  utils: {
    decode_range: jest.fn(() => ({ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } })), // Mock range
    // Define cell coordinates type
    encode_cell: jest.fn((cell: { r: number; c: number }) => {
        const col = String.fromCharCode(65 + cell.c); // A, B, ...
        const row = cell.r + 1;
        return `${col}${row}`;
    }),
    sheet_to_json: jest.fn(),
  },
  SheetNames: [], // Will be overridden in tests
  Sheets: {},     // Will be overridden in tests
}));

// Define type for the sheet data structure
type MockSheetData = Record<string, (string | number)[][]>;
// Define type for the mocked Workbook structure
interface MockWorksheet {
  [key: string]: { t: string; v: string | number } | string; // Allow cell objects OR string for !ref keys like '!ref'
}
interface MockWorkbook {
  SheetNames: string[];
  Sheets: Record<string, MockWorksheet>;
}

// Helper to mock XLSX.read and XLSX.utils.sheet_to_json
const mockXlsxRead = (sheetData: MockSheetData) => {
  const mockWorkbook: MockWorkbook = {
    SheetNames: Object.keys(sheetData),
    Sheets: {},
  };
  Object.keys(sheetData).forEach((sheetName: string) => {
    const data = sheetData[sheetName];
    // Basic mock of a worksheet structure - adjust if needed
    // 1. Create base object for cell data
    const worksheetBase: { [key: string]: { t: string; v: string | number } } = {};
    // 2. Populate cells for sheet_to_json mock
    data.forEach((row: (string | number)[], r: number) => {
        row.forEach((cellValue: string | number, c: number) => {
            const cellAddress = XLSX.utils.encode_cell({r,c});
            worksheetBase[cellAddress] = { t: typeof cellValue === 'number' ? 'n' : 's', v: cellValue };
        });
    });
    // 3. Create final worksheet object by combining base and !ref
    const worksheet: MockWorksheet = {
        ...worksheetBase,
        '!ref': `A1:${XLSX.utils.encode_cell({ r: data.length - 1, c: (data[0]?.length ?? 1) - 1 })}`
    };
    mockWorkbook.Sheets[sheetName] = worksheet;
  });

  (XLSX.read as jest.Mock).mockReturnValue(mockWorkbook);
  (XLSX.utils.sheet_to_json as jest.Mock).mockImplementation((worksheet: MockWorksheet) => {
    // Find sheet name by comparing worksheet objects (might need refinement)
    const sheetName = Object.keys(mockWorkbook.Sheets).find(name => mockWorkbook.Sheets[name] === worksheet);
    return sheetName ? sheetData[sheetName] : []; // Ensure sheetName is defined before indexing
  });
};

// Mock global fetch
global.fetch = jest.fn();

describe('DocumentViewer Refresh Logic', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Provide the mock user to useAuth
    (useAuth as jest.Mock).mockReturnValue({ user: { uid: 'test-user-123' } });

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key) => {
          if (key === `activeSheet-${'doc-1'}`) {
            return 'Sheet1'; // Simulate saved active sheet
          }
          return null;
        }),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    });

    // Mock initial fetch for the document content
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)), // Mock ArrayBuffer
      // Add other response methods if needed (text, json)
    });
    // Mock XLSX read for initial load
    mockXlsxRead({
      'Sheet1': [
        ['Header1', 'Header2'],
        ['Initial A2', 'Initial B2'],
      ],
    });

    // Mock getDoc for the initial refresh trigger (or initial load if not event driven)
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      id: 'doc-1',
      data: () => ({
          id: 'doc-1',
          userId: 'test-user-123',
          name: 'initial_sheet.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          storagePath: 'users/test-user-123/doc-1.xlsx',
          size: 1024,
          uploadedAt: Timestamp.fromDate(new Date()), // Use mocked Timestamp
          updatedAt: Timestamp.fromDate(new Date()), // Add updatedAt
          status: 'complete', // Add status
          createdAt: Timestamp.fromDate(new Date()), // Add createdAt
      }),
    });
  });

  test('should refresh and display updated Excel content when excel-document-updated event is received', async () => {
    // --- Initial Render ---
    render(<DocumentViewer document={{
      id: 'doc-1',
      userId: 'test-user-123',
      name: 'initial_sheet.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      storagePath: 'users/test-user-123/doc-1.xlsx',
      size: 1024,
      folderId: null,      uploadedAt: Timestamp.fromDate(new Date()), // Use mocked Timestamp
      updatedAt: Timestamp.fromDate(new Date()), // Add updatedAt
      status: 'complete', // Add status
      createdAt: Timestamp.fromDate(new Date()), // Add createdAt
    }} />);

    // Wait for initial content to load
    await waitFor(() => {
      expect(screen.getByText('Initial A2')).toBeInTheDocument();
    });
    expect(screen.getByText('Initial B2')).toBeInTheDocument();
    expect(screen.queryByText('Updated A2')).not.toBeInTheDocument();

    // --- Simulate Update and Event ---

    // 1. Mock the Firestore getDoc call for the *refresh*
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      id: 'doc-1',
      data: () => ({
          id: 'doc-1',
          userId: 'test-user-123',
          name: 'updated_sheet.xlsx', // Simulate name change if needed
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          storagePath: 'users/test-user-123/doc-1.xlsx',
          size: 2048,
          uploadedAt: Timestamp.fromDate(new Date()), // Use mocked Timestamp
          updatedAt: Timestamp.fromDate(new Date(Date.now() + 10000)), // Later timestamp
          status: 'complete', // Add status
          createdAt: Timestamp.fromDate(new Date()), // Add createdAt
      }),
    });

    // 2. Mock the fetch call for the *refreshed* content
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(16)), // Different buffer
    });
    // 3. Mock XLSX read for the *refreshed* data
    mockXlsxRead({
      'Sheet1': [
        ['Header1', 'Header2'],
        ['Updated A2', 'Updated B2'],
      ],
    });

    // 4. Dispatch the event
    // Need to wrap event dispatch and subsequent checks in act
    await act(async () => {
      const event = new CustomEvent('excel-document-updated');
      window.dispatchEvent(event);
    });

    // --- Assertions ---
    // Wait for the updated content to appear
    await waitFor(() => {
        // Check that getDoc was called again after the event
        // Note: getDoc might be called multiple times depending on initial load vs refresh logic
        expect(getDoc).toHaveBeenCalled(); 
        // Check fetch was called again for the refresh
        expect(global.fetch).toHaveBeenCalledTimes(2); // Initial load + refresh
        // Check XLSX.read was called again
        expect(XLSX.read).toHaveBeenCalledTimes(2); // Initial load + refresh
    });

    // Verify updated content is displayed
    await waitFor(() => {
        expect(screen.getByText('Updated A2')).toBeInTheDocument();
        expect(screen.getByText('Updated B2')).toBeInTheDocument();
    });
    // Verify old content is gone
    expect(screen.queryByText('Initial A2')).not.toBeInTheDocument();

    // Optional: Check localStorage was updated if active sheet logic runs
    // expect(window.localStorage.setItem).toHaveBeenCalledWith(`activeSheet-${updatedDocData.id}`, 'Sheet1');
  });
});
