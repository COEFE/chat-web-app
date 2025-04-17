# Multi-Document Chat Feature - TODO

This file tracks the implementation steps for allowing users to chat with multiple documents simultaneously.

## 1. Document Chat Page (`/frontend/src/app/document-chat/[documentId]/page.tsx`)

-   [x] Refactor state to hold an array of documents (`documents: MyDocumentData[]`).
-   [x] Fetch the initial document based on URL parameter (`documentId`).
-   [x] Add a placeholder "Add Doc" button to the UI.
-   [x] Implement the `handleAddDocument` function:
    -   [x] Add state to manage the visibility of the document selection modal (e.g., `isModalOpen`).
    -   [x] Open the modal when the "Add Doc" button is clicked.
-   [x] Implement a callback function (e.g., `handleDocumentSelected`) to receive the selected document ID from the modal:
    -   [x] Fetch the selected document's data using its ID.
    -   [x] Add the fetched document data to the `documents` state array.
    -   [x] Ensure duplicate documents cannot be added.
    -   [x] Close the modal.
-   [x] Pass the list of currently open document IDs to the modal to prevent re-selection.
-   [x] Update the header title to reflect multiple documents (e.g., "Chat with Doc A, Doc B").
-   [x] Conditionally render the document selection modal.

## 2. Create Add Document Modal (`/frontend/src/components/dashboard/AddDocumentModal.tsx`)

-   [x] Create the `AddDocumentModal.tsx` component file.
-   [x] Define props for the modal:
    -   `isOpen: boolean`
    -   `onClose: () => void`
    -   `onDocumentSelect: (documentId: string) => void`
    -   `excludedDocumentIds: string[]` (to disable already open docs)
-   [x] Use a Shadcn UI Dialog or similar component for the modal structure.
-   [x] Fetch the user's documents (similar to the dashboard view).
    -   [x] Implement search functionality for easier document finding.
-   [x] Display the documents in a list or grid format.
    -   [x] Used a grid layout similar to DocumentGrid but simplified for the modal context.
-   [x] Disable selection for documents whose IDs are in `excludedDocumentIds`.
-   [x] Handle selection of a document and call `onDocumentSelect` with the ID.
-   [x] Include a close button and handle the `onClose` callback.

## 3. Document Viewer (`/frontend/src/components/dashboard/DocumentViewer.tsx`)

-   [ ] Modify `DocumentViewer` props to accept:
    -   `documents: MyDocumentData[]` (the array of open documents)
    -   `activeDocumentId: string` (the ID of the document currently being viewed)
    -   `onSwitchDocument: (documentId: string) => void` (optional, if tabs are inside viewer)
-   [ ] Implement a UI mechanism to switch between viewing different documents (e.g., Tabs above the viewer, controlled by the parent page).
-   [ ] Ensure the viewer correctly displays the content of the `activeDocumentId`.

## 4. Document Chat Page - Document Switching

- [x] Add state to `DocumentChatPage` to track the `activeDocumentId` for the viewer.
- [x] Implement tab controls (or other UI) in `DocumentChatPage` to allow the user to switch the `activeDocumentId`.
- [x] Pass `activeDocumentId` to `DocumentViewer`.

## 5. Chat Interface (`/frontend/src/components/dashboard/ChatInterface.tsx`)

- [x] Modify `ChatInterface` props to accept an array of `MyDocumentData` or their IDs (`documentIds: string[]`).
- [x] Update the API call within `ChatInterface` (likely in the `useChat` or similar hook interaction) to send all relevant `documentIds` to the backend.
- [ ] Potentially update the UI to indicate which document(s) the AI's response relates to, if applicable (this might be complex).

## 6. Backend Chat API (`/api/chat` or similar)

- [x] Update the chat API endpoint request body to accept an array of `documentIds`.
- [x] Modify the backend logic (e.g., RAG pipeline, prompt construction) to retrieve context/chunks from _all_ specified documents based on the user's query.
- [x] Combine context from multiple documents effectively before sending to the LLM.
- [x] Ensure the backend can handle potential errors if one of the documents doesn't exist or can't be accessed.

## 7. UI Enhancements

- [x] Add ability to access all user documents when adding a new document to chat
- [x] Add document removal functionality (close button on tabs)
- [x] Improve tab UI with truncation and tooltips for long document names
- [x] Add visual indication for documents that are already in the chat
- [x] Add date information to document cards in the selection modal
- [x] Make tabs scrollable for many documents

## 8. Testing

- [x] Test opening the modal.
- [x] Test that already open documents are disabled in the modal.
- [x] Test selecting and adding a second document.
- [x] Test that the viewer updates when switching document tabs.
- [x] Test removing documents from the chat.
- [ ] Test sending chat messages and verifying context from both documents is considered (requires backend changes).
- [x] Test error handling (e.g., fetching errors, non-existent docs).
- [x] Test UI responsiveness.
