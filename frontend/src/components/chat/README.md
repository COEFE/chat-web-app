# Chat Bot Agent System

## Overview

The Chat Bot Agent system provides an AI-powered assistant that helps users with financial management, journal entries, and system navigation. It integrates seamlessly with the existing receipt and transaction management system.

## Components

### 1. ChatBotAgent (`/lib/agents/chatBotAgent.ts`)

The main agent that handles user queries and provides intelligent responses.

**Capabilities:**
- **Journal Entry Reclassification**: Relays requests to the GL Agent for journal entry operations
- **Data Insights**: Answers questions about receipts, transactions, and financial data
- **System Help**: Provides guidance on using system features
- **Financial Analysis**: Generates insights and reports based on user data

**Query Classification:**
- `journal_entry_reclass` - Journal entry operations
- `data_inquiry` - Specific data questions
- `receipt_question` - Receipt-related queries
- `transaction_question` - Transaction inquiries
- `system_help` - Feature guidance
- `financial_insights` - Analysis and reporting
- `general` - General conversation

### 2. ChatBotInterface (`/components/chat/ChatBotInterface.tsx`)

The main chat interface component that provides:
- Real-time messaging with the AI assistant
- Quick action buttons for common tasks
- Message history and conversation flow
- Loading states and error handling

**Features:**
- Auto-scrolling message area
- Quick action shortcuts
- Responsive design
- Dark mode support

### 3. FloatingAssistant (`/components/chat/FloatingAssistant.tsx`)

A floating button that provides easy access to the assistant from any page.

**Features:**
- Fixed position floating button
- Modal dialog with full chat interface
- Smooth animations and transitions
- Accessible design

### 4. Assistant Page (`/app/assistant/page.tsx`)

A dedicated page for the AI assistant with:
- Full-screen chat interface
- Feature overview cards
- Navigation integration

## API Integration

### Endpoint: `/api/assistant`

**POST Request:**
```json
{
  "query": "User's question or request",
  "idToken": "Firebase ID token for authentication"
}
```

**Response:**
```json
{
  "success": boolean,
  "message": "Assistant's response",
  "data": any // Optional additional data
}
```

## Usage Examples

### 1. Financial Data Queries
- "How much did I spend at Whole Foods this month?"
- "Show me my top 5 expense categories"
- "What's my total spending for this month?"

### 2. Journal Entry Operations
- "Create a journal entry to reclassify office supplies"
- "Help me create a journal entry for equipment purchase"
- "Reclassify the last transaction to marketing expenses"

### 3. System Help
- "How do I upload receipts?"
- "How do I create a journal entry?"
- "Show me how to use the dashboard"

### 4. Financial Insights
- "Analyze my spending patterns"
- "Show me monthly trends"
- "What are my biggest expense categories?"

## Integration Points

### Navigation
The assistant is accessible through:
- Main navigation: "AI Assistant" link
- Floating button on dashboard pages
- Direct URL: `/assistant`

### Data Access
The agent has access to:
- Receipt data (`receipt_embeddings` table)
- Transaction data (`transactions` table)
- Account information (`accounts` table)
- Journal entries (via GL Agent integration)

### GL Agent Integration
Journal entry requests are automatically routed to the existing GL Agent, which handles:
- Journal entry creation
- Account classification
- GL code generation
- Posting to the general ledger

## Security

- All requests require Firebase authentication
- User data is isolated by `userId`
- API endpoints verify ID tokens
- No sensitive data is logged

## Development

### Adding New Query Types
1. Add the new type to `classifyQuery()` method
2. Create a handler method (e.g., `handleNewQueryType()`)
3. Add the case to the main `handle()` method switch statement

### Extending Data Access
1. Add new data retrieval methods (e.g., `getNewDataType()`)
2. Update the `gatherDataContext()` method if needed
3. Ensure proper user data isolation

### Testing
Run the test suite:
```bash
npm test chatBotAgent.test.ts
```

## Future Enhancements

- Voice input/output capabilities
- Multi-language support
- Advanced financial analytics
- Integration with external accounting systems
- Scheduled reports and notifications
- Custom query templates
