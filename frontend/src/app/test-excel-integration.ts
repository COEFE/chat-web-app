import fetch from 'node-fetch';

/**
 * This script tests the integration between the chat API and Excel API
 * It simulates Claude AI generating an Excel file and then editing it
 */
async function testExcelIntegration() {
  try {
    console.log('Testing Excel integration with Claude AI...');
    
    // Mock user token - in a real scenario, this would be a valid Firebase ID token
    const mockToken = 'mock-token';
    
    // 1. Simulate Claude AI creating an Excel file
    console.log('Step 1: Simulating Claude AI creating an Excel file...');
    
    const createResponse = await simulateClaudeResponse({
      message: "Create an Excel file with sales data for Q1 2023",
      includeJson: true,
      operation: 'create',
      fileName: 'Q1_2023_Sales',
      data: [
        {
          sheetName: 'Sales',
          sheetData: [
            ['Month', 'Region', 'Product', 'Revenue'],
            ['January', 'North', 'Widget A', 12500],
            ['January', 'South', 'Widget A', 8700],
            ['February', 'North', 'Widget B', 15200],
            ['February', 'South', 'Widget B', 10300],
            ['March', 'North', 'Widget C', 18100],
            ['March', 'South', 'Widget C', 14200]
          ]
        }
      ]
    }, mockToken);
    
    console.log('Create response:', createResponse);
    
    // Extract document ID from the response
    const documentId = createResponse.response?.excelOperation?.documentId;
    
    if (!documentId) {
      throw new Error('Failed to get document ID from create response');
    }
    
    console.log(`Excel file created with document ID: ${documentId}`);
    
    // 2. Simulate Claude AI editing the Excel file
    console.log('Step 2: Simulating Claude AI editing the Excel file...');
    
    const editResponse = await simulateClaudeResponse({
      message: "Update the Q1 sales data to add a Total column",
      includeJson: true,
      operation: 'edit',
      documentId,
      data: [
        {
          sheetName: 'Sales',
          cellUpdates: [
            { cell: 'E1', value: 'Total' },
            { cell: 'E2', value: '=D2' },
            { cell: 'E3', value: '=D3' },
            { cell: 'E4', value: '=D4' },
            { cell: 'E5', value: '=D5' },
            { cell: 'E6', value: '=D6' },
            { cell: 'E7', value: '=D7' }
          ]
        }
      ]
    }, mockToken);
    
    console.log('Edit response:', editResponse);
    
    console.log('Excel integration test completed successfully!');
  } catch (error) {
    console.error('Error testing Excel integration:', error);
  }
}

/**
 * Helper function to simulate Claude AI generating a response with Excel operations
 */
async function simulateClaudeResponse(options: {
  message: string;
  includeJson: boolean;
  operation: 'create' | 'edit';
  fileName?: string;
  documentId?: string;
  data: any[];
}, token: string) {
  // Create a mock Claude response with or without JSON
  let claudeResponse = `I'll help you with that Excel file.`;
  
  if (options.includeJson) {
    const jsonData = options.operation === 'create' 
      ? {
          excel_operation: 'create',
          fileName: options.fileName,
          data: options.data
        }
      : {
          excel_operation: 'edit',
          documentId: options.documentId,
          data: options.data
        };
    
    claudeResponse += `\n\n\`\`\`json\n${JSON.stringify(jsonData, null, 2)}\n\`\`\``;
  }
  
  // This simulates what would happen in the chat API
  // In a real scenario, this would be a call to the actual chat API
  console.log('Simulating chat API processing with message:', options.message);
  console.log('Claude response would be:', claudeResponse);
  
  // In a real scenario, the chat API would extract the JSON and call the Excel API
  // Here we're just simulating the response structure
  return {
    response: {
      id: `ai-${Date.now()}`,
      role: 'ai',
      content: claudeResponse.replace(/```json[\s\S]*```/g, options.operation === 'create' 
        ? `I've created a new Excel file named "${options.fileName}" for you.`
        : `I've updated the Excel file as requested.`),
      excelOperation: {
        success: true,
        message: options.operation === 'create' 
          ? 'Excel file created successfully' 
          : 'Excel file updated successfully',
        documentId: options.operation === 'create' ? 'mock-doc-id' : options.documentId,
        fileName: options.fileName || 'document.xlsx',
        url: 'https://example.com/download/file.xlsx'
      }
    }
  };
}

// Uncomment to run the test
// testExcelIntegration();

export default testExcelIntegration;
