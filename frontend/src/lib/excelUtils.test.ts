// frontend/src/lib/excelUtils.test.ts
import { createExcelFile, editExcelFile } from './excelUtils';
import * as admin from 'firebase-admin';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended'; // Using jest-mock-extended example
import { Bucket, File } from '@google-cloud/storage';

// Mock Firebase Admin SDK parts (Adjust based on your actual setup)
// It's often better to mock specific functions used rather than the whole module
jest.mock('firebase-admin/app', () => ({
  // Mock initializeApp and other functions if needed
}));
jest.mock('firebase-admin/firestore', () => ({
  // Mock Firestore methods used, e.g., Timestamp
  Timestamp: {
    now: jest.fn(() => ({
      toDate: () => new Date(), // Provide a basic mock Timestamp
      toMillis: () => Date.now(),
    })),
  },
  // Add mocks for FieldValue if used
}));

// --- Mocking Firestore Instance and Methods ---
// Create deep mocks for the services
const mockFirestore = mockDeep<admin.firestore.Firestore>();
const mockStorage = mockDeep<admin.storage.Storage>();
const mockBucket = mockDeep<Bucket>(); // Mock the Bucket object

// Mock specific methods chained from the services
const mockCollectionRef = mockDeep<admin.firestore.CollectionReference>();
const mockDocRef = mockDeep<admin.firestore.DocumentReference>();
const mockQuery = mockDeep<admin.firestore.Query>();
const mockQuerySnap = mockDeep<admin.firestore.QuerySnapshot>();
const mockDocSnap = mockDeep<admin.firestore.DocumentSnapshot>();
const mockWriteResult = mockDeep<admin.firestore.WriteResult>();
const mockStorageFile = mockDeep<File>(); // Mock the File object from @google-cloud/storage

// Helper to create mock Excel data
const createMockExcelData = () => Buffer.from('mock excel data');

describe('excelUtils', () => {
  // Reset mocks before each test
  beforeEach(() => {
    mockReset(mockFirestore);
    mockReset(mockStorage);
    mockReset(mockBucket);
    mockReset(mockCollectionRef);
    mockReset(mockDocRef);
    mockReset(mockQuery);
    mockReset(mockQuerySnap);
    mockReset(mockDocSnap);
    mockReset(mockWriteResult);
    mockReset(mockStorageFile);

    // --- Setup default mock behaviors ---
    // Firestore Mocks
    mockFirestore.collection.mockReturnValue(mockCollectionRef);
    mockCollectionRef.doc.mockReturnValue(mockDocRef);
    mockDocRef.collection.mockReturnValue(mockCollectionRef); // For nested collections
    mockDocRef.get.mockResolvedValue(mockDocSnap);
    mockDocRef.set.mockResolvedValue(mockWriteResult);
    mockCollectionRef.where.mockReturnValue(mockQuery);
    mockQuery.get.mockResolvedValue(mockQuerySnap);

    // Storage Mocks
    // Mock bucket().file() path
    mockBucket.file.mockReturnValue(mockStorageFile); 
    // Mock the save() method on the File object
    mockStorageFile.save.mockResolvedValue(undefined as any); // save returns void promise

    // Mock storage.bucket() to return our mock Bucket
    // Need to handle potential default bucket name argument
    (mockStorage.bucket as jest.Mock).mockReturnValue(mockBucket); 

  });

  describe('createExcelFile', () => {
    const userId = 'test-user-id';
    const initialDocId = 'test-doc-base'; // ID passed initially
    const similarDocId = 'test-doc-base-12345'; // ID of the existing similar doc
    const initialStoragePath = `users/${userId}/${initialDocId}.xlsx`;
    const similarStoragePath = `users/${userId}/${similarDocId}.xlsx`; // The *correct* path
    const mockData = [[{ value: 'A1' }], [{ value: 'B1' }]]; // Example data structure
    const excelBuffer = createMockExcelData(); // We don't check buffer content here

    it('should update existing similar document and use its ID for storage path', async () => {
      // --- Mock Specific Scenario ---
      const initialDocRefMock = mockDocRef; // Use the generic mockDocRef for the first call
      const similarDocRefMock = mockDeep<admin.firestore.DocumentReference>(); // Specific mock for similar doc
      const initialDocSnapMock = mockDeep<admin.firestore.DocumentSnapshot>();
      const similarDocSnapMock = mockDeep<admin.firestore.DocumentSnapshot>();
      const querySnapMock = mockDeep<admin.firestore.QuerySnapshot>();

      // 1. Initial doc ID doesn't exist
      mockCollectionRef.doc.calledWith(initialDocId).mockReturnValue(initialDocRefMock);
      initialDocRefMock.get.mockResolvedValue(initialDocSnapMock);
      // Use mockReturnValue for property accessors if mockDeep doesn't handle them
      Object.defineProperty(initialDocSnapMock, 'exists', { get: jest.fn(() => false) });


      // 2. findSimilarDocumentByBaseName finds the similar doc
      // Mock the where().get() specifically for the findSimilar logic
      mockQuery.get.mockResolvedValue(querySnapMock); // Ensure query.get returns our specific snapshot
      Object.defineProperty(querySnapMock, "empty", { value: false, writable: true });
      Object.defineProperty(querySnapMock, "docs", { value: [similarDocSnapMock], writable: true }); // Return the similar doc snapshot
      Object.defineProperty(similarDocSnapMock, 'exists', { get: jest.fn(() => true) });
      Object.defineProperty(similarDocSnapMock, "id", { value: similarDocId, writable: true }); // Set the ID of the found doc
      similarDocSnapMock.data.mockReturnValue({
        name: 'Existing Similar Doc',
        storagePath: 'users/userId/some-old-path.xlsx',
        userId: userId,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 100
      });

      // 3. Mock the set operation on the *similar* doc ref
      mockCollectionRef.doc.calledWith(similarDocId).mockReturnValue(similarDocRefMock); // Ensure doc() call returns the specific mock
      similarDocRefMock.set.mockResolvedValue(mockWriteResult); // Ensure set() resolves

      // 4. Mock storage upload using the *similar* storage path
      // Ensure bucket.file() is called with the correct path
      mockBucket.file.calledWith(similarStoragePath).mockReturnValue(mockStorageFile);
      mockStorageFile.save.mockResolvedValue(undefined as any); // Ensure save() resolves

      // --- Call Function ---
      const result = await createExcelFile(
        mockFirestore as admin.firestore.Firestore, // Cast needed
        mockStorage as admin.storage.Storage,
        mockBucket as Bucket,
        userId,
        initialDocId, // Call with the ID that *doesn't* have an exact match
        mockData
      );

      // --- Assertions ---
      // Verify Firestore set was called on the SIMILAR doc ID
      expect(mockCollectionRef.doc).toHaveBeenCalledWith(similarDocId);
      expect(similarDocRefMock.set).toHaveBeenCalledTimes(1);
      // Verify the metadata passed to set included the CORRECT storage path
      expect(similarDocRefMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          storagePath: similarStoragePath // Crucial check!
        }),
        { merge: true }
      );

      // Verify Storage upload was called with the SIMILAR storage path
      expect(mockBucket.file).toHaveBeenCalledWith(similarStoragePath);
      expect(mockStorageFile.save).toHaveBeenCalledTimes(1);
      // You could check the buffer if needed: expect(mockStorageFile.save).toHaveBeenCalledWith(expect.any(Buffer));

      // Verify the returned ID is the SIMILAR doc ID
      expect(result.success).toBe(true);
      expect(result.documentId).toBe(similarDocId); // Crucial check!
    });

    // --- Test for editExcelFile ---
    it('should update existing document and storage file for edit operation', async () => {
      const editDocId = 'existing-doc-to-edit';
      const editStoragePath = `users/${userId}/${editDocId}.xlsx`;
      const editData = [[{ value: 'Updated A1' }]]; // New data for the edit
      const existingExcelBuffer = Buffer.from('old excel data');
      const updatedExcelBuffer = Buffer.from('new excel data'); // Represent the output buffer

      // --- Mock Specific Scenario ---
      const editDocRefMock = mockDeep<admin.firestore.DocumentReference>();
      const editDocSnapMock = mockDeep<admin.firestore.DocumentSnapshot>();
      const editStorageFileMock = mockDeep<File>(); // Mock for the specific file path

      // 1. Mock Firestore doc().get() for the existing document
      mockCollectionRef.doc.calledWith(editDocId).mockReturnValue(editDocRefMock);
      editDocRefMock.get.mockResolvedValue(editDocSnapMock);
      Object.defineProperty(editDocSnapMock, 'exists', { get: jest.fn(() => true) });
      editDocSnapMock.data.mockReturnValue({
        name: 'Document To Edit',
        storagePath: editStoragePath, // Crucial: points to the correct existing path
        userId: userId,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(), // Will be updated
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: existingExcelBuffer.length
      });

      // 2. Mock Storage bucket.file().download() for the existing file
      mockBucket.file.calledWith(editStoragePath).mockReturnValue(editStorageFileMock);
      // download() returns a Promise<[Buffer]>
      editStorageFileMock.download.mockResolvedValue([existingExcelBuffer] as any);

      // 3. Mock Firestore doc().update()
      editDocRefMock.update.mockResolvedValue(mockWriteResult);

      // 4. Mock Storage bucket.file().save() for overwriting the *same* file
      // Ensure the same file mock is configured to handle the save call
      editStorageFileMock.save.mockResolvedValue(undefined as any);

      // --- (Optional) Mock xlsx processing if necessary, but often not needed ---
      // jest.spyOn(XLSX, 'read').mockReturnValue(...);
      // jest.spyOn(XLSX, 'write').mockReturnValue(updatedExcelBuffer); // Return the expected output buffer

      // --- Call Function ---
      const result = await editExcelFile( // Ensure editExcelFile is exported and imported
        mockFirestore as admin.firestore.Firestore,
        mockStorage as admin.storage.Storage,
        mockBucket as Bucket,
        userId,
        editDocId, // Call with the ID that *does* exist
        editData // The edit instructions/data
      );

      // --- Assertions ---
      // Verify Firestore get was called
      expect(editDocRefMock.get).toHaveBeenCalledTimes(1);

      // Verify Storage download was called
      expect(mockBucket.file).toHaveBeenCalledWith(editStoragePath);
      expect(editStorageFileMock.download).toHaveBeenCalledTimes(1);

      // Verify Firestore update was called on the SAME doc ID
      expect(editDocRefMock.update).toHaveBeenCalledTimes(1);
      // Check that updatedAt and size were likely updated (content depends on actual logic)
      expect(editDocRefMock.update).toHaveBeenCalledWith(expect.objectContaining({
        // size: updatedExcelBuffer.length, // Check if size is updated
        updatedAt: expect.any(Object), // Check if updatedAt is updated (mocked Timestamp)
      }));

      // Verify Storage save was called on the SAME path
      expect(mockBucket.file).toHaveBeenCalledWith(editStoragePath); // Called again for save
      expect(editStorageFileMock.save).toHaveBeenCalledTimes(1);
      // expect(editStorageFileMock.save).toHaveBeenCalledWith(updatedExcelBuffer); // Check buffer if needed

      // Verify success and the returned ID matches the edited document
      expect(result.success).toBe(true);
      expect(result.documentId).toBe(editDocId);
    });

  });
});
