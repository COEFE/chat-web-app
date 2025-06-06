# Task List for AI Document Chat Assistant

## Project Setup
- [x] **Repository & Project Structure**
  - [x] Initialize a Git repository (consider a monorepo if combining frontend, backend, and Python service).
  - [x] Define branch structure and development workflow.
- [x] **Environment Configuration**
  - [x] Set up environment variables for Firebase, Anthropic API key, and any secrets.
  - [x] Provision a Firebase project (Firestore, Storage, Authentication).
  - [x] Provision a Google Cloud project for Cloud Run (Python microservice).
  - [x] Connect repository to Vercel for deployment.

## Frontend Development (Next.js)
- [x] **Project Initialization**
  - [x] Create a new Next.js project (with TypeScript if preferred).
  - [x] Install necessary packages: shadcn-ui, react-resizable-panels, react-pdf, mammoth, xlsx, ai, react-dropzone.
- [x] **Authentication UI**
  - Develop a login page integrated with Firebase Authentication.
- [x] **Dashboard & Document Library**
  - Create a dashboard page displaying a list/grid of uploaded documents.
  - Integrate Firestore to fetch and display document metadata.
- [x] **File Upload Component**
  - [x] Build a drag-and-drop file uploader and file-picker.
  - [x] Integrate the uploader with Firebase Storage and update Firestore with metadata.
- [x] **Document Viewer & Split-Pane Layout**
  - [x] Implement a resizable split-pane layout (using react-resizable-panels):
    - **Left Pane:** Develop components for rendering:
      - [x] PDFs using react-pdf.
      - [x] DOCX files (using Mammoth.js or by converting DOCX to PDF).
      - [x] Excel/CSV files using SheetJS (render as an HTML table).
      - [x] Images with native HTML tags (plus optional zoom/pan features).
    - **Right Pane:** Create a chat interface using a pre-built React chat component.
      - [x] Implement basic chat UI component (`ChatInterface.tsx`)
      - [x] Implement message display and state management
      - [x] Implement input handling and sending logic
- [x] **AI Chat Integration**
  - [x] Wire the chat interface to send queries to backend API endpoints (using mock backend initially).
  - [x] Display AI responses within the chat UI.
- [ ] **Multi-Document Context**
  - Allow selection of multiple documents for comparative analysis.
  - Implement UI to list selected document names and switch the primary preview.

## Backend Development (Next.js API Routes / Firebase Functions)
- [x] **API for AI Queries**
  - Create an API route to:
    - [x] Receive user query and document ID (`/api/chat` created).
    - [x] Verify the admin's Firebase auth token.
    - [x] Retrieve document text or summaries from Firestore/Storage.
    - [x] Forward the query with document context to the Anthropic Claude API. (Verified with SDK v4)
    - [x] Return the AI response to the frontend. (Verified streaming with SDK v4)
- [x] **Document Metadata & Version Management**
  - [x] Create API endpoints for updating document metadata (e.g., after file uploads or edits).
  - [ ] Implement versioning logic: record each new version in Firestore and update Firebase Storage paths. (Partially done: Fixed update logic to prevent duplicates, full history TBD)
- [ ] **Firebase Cloud Functions (if needed)**
  - Optionally, develop Cloud Functions for background tasks (e.g., on file upload triggers to extract text or generate previews).

## Python Microservice (Document Processing on Cloud Run)
- [ ] **Service Setup**
  - Initialize a Python project with Flask or FastAPI.
  - Develop endpoints to:
    - Extract text from DOCX, XLSX, and CSV files.
    - Apply AI-generated edits using python-docx and OpenPyXL.
- [ ] **Containerization & Deployment**
  - Write a Dockerfile for the Python service.
  - Deploy the service on Google Cloud Run.
- [ ] **Integration with Storage**
  - Implement functionality to fetch original files from Firebase Storage.
  - Save edited documents as new versions back to Firebase Storage.

## AI Integration (Anthropic Claude API)
- [ ] **Prompt Design & API Integration**
  - Design prompt templates for document Q&A and editing requests.
  - [x] Implement API calls from the backend (Next.js API routes) to the Anthropic Claude API. (Refactored to SDK v4)
- [ ] **Multi-Document Context Handling**
  - Create logic to assemble multiple document texts into a single API request.
- [x] **Structured Response Parsing**
  - [x] Develop parsers to handle structured edit responses (e.g., JSON diff) returned by Claude.
  - [x] Develop parsers to handle structured edit responses (e.g., JSON diff) returned by Claude. (Verified in onFinish callback)

## Authentication & Security
- [x] **Firebase Authentication**
  - Configure Firebase Auth for admin login.
  - Implement client-side login logic in the Next.js app.
- [x] **Backend Auth Verification**
  - Verify Firebase ID tokens in API routes using the Firebase Admin SDK.
- [x] **Security Rules**
  - [x] Set Firestore rules to restrict read/write access to authenticated admin users.
  - [x] Configure Firebase Storage rules similarly.
- [ ] **Environment Security**
  - Securely store and manage environment variables in Vercel and Cloud Run.

## Deployment & CI/CD
- [ ] **Frontend Deployment**
  - Deploy the Next.js application to Vercel.
  - Configure environment variables and ensure API routes work correctly on Vercel.
- [ ] **Backend & Cloud Functions Deployment**
  - Set up CI/CD (using GitHub Actions or similar) to deploy Next.js API routes and Firebase Cloud Functions.
- [ ] **Python Service Deployment**
  - Deploy the Python microservice on Cloud Run.
  - Test integration between the Next.js API and the Python service.
- [ ] **Monitoring & Logging**
  - Set up logging for Vercel functions, Firebase, and Cloud Run.
  - Implement monitoring tools to track API performance and errors.

## Testing & QA
- [ ] **Unit & Integration Tests**
  - [x] Write tests for API endpoints, especially for authentication and AI query handling.
  - [x] Test document upload and metadata storage (Tested metadata update for edits).
- [ ] **End-to-End Testing**
  - [ ] Simulate a full workflow: upload document, view in split-pane, interact with AI chat, and apply an edit. (Tested Excel edit flow end-to-end)
- [ ] **Security Testing**
  - Verify authentication and authorization for all protected routes.
  - Test Firestore and Storage security rules.
- [ ] **Performance Testing**
  - Load test file parsing and AI queries to ensure acceptable response times.

## Documentation & Future Enhancements
- [ ] **Project Documentation**
  - Update the PRD and technical documentation as features are implemented.
  - Document API endpoints, prompt templates, and data models.
- [ ] **User Guide**
  - Prepare a simple admin user guide detailing:
    - How to upload documents.
    - How to use the split-pane view and chat.
    - How to view and revert version history.
- [ ] **Roadmap Planning**
  - Outline tasks for future features (e.g., multi-user support, mobile app, advanced diff view).

## Completed and Pending Tasks
- [x] Set up basic Next.js project structure.
- [x] Implement user authentication using NextAuth.js.
- [x] Integrate Firebase for backend services (Firestore, Storage).
- [x] Implement PDF file upload functionality to Firebase Storage.
- [x] Set up API route for handling chat interactions.
- [x] Integrate Anthropic API for generating chat responses. (Fixed with SDK v4)
- [x] Connect frontend chat interface to the API route.
- [x] Resolve Firebase Admin SDK initialization issues in Vercel deployment.
- [x] Ensure chat functionality works with uploaded PDFs (and Excel edits). (Verified basic streaming & history)
- [ ] Implement document selection/management UI.
- [x] Add context awareness (remembering previous messages in a chat session).
- [x] Implement UI for displaying chat history.
- [ ] Add error handling and loading states to the UI.
- [ ] Improve UI/UX (styling, responsiveness).
- [ ] Refactor code for clarity and maintainability.
- [ ] Add tests (unit, integration).
