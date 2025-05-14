/**
 * Test script for agent communication
 * 
 * This file contains functions to test the communication between the AP agent and GL agent,
 * specifically for GL account creation requests.
 */

import { APAgent } from '@/lib/agents/apAgent';
import { GLAgent } from '@/lib/agents/glAgent';
import { AgentContext } from '@/types/agents';
import { sendAgentMessage, MessagePriority, MessageStatus } from '@/lib/agentCommunication';

/**
 * Test the AP agent requesting a GL account creation
 */
export async function testAPGLCommunication(userId: string): Promise<void> {
  console.log('Starting AP-GL communication test...');
  
  // Create the agents
  const apAgent = new APAgent();
  const glAgent = new GLAgent();
  
  // Create a test context
  const context: AgentContext = {
    query: 'Test query',
    userId: userId,
    conversationId: 'test-conversation-' + Date.now()
  };
  
  try {
    // 1. AP agent sends a message to GL agent requesting account creation
    console.log('1. AP agent requesting GL account creation...');
    
    // Since requestGLAccountCreation is private, we'll use sendAgentMessage directly
    const message = await sendAgentMessage(
      'ap_agent', // AP agent as sender
      'gl_agent', // GL agent as recipient
      'CREATE_GL_ACCOUNT', // Action
      {
        expenseDescription: 'Office Supplies for Marketing Department',
        expenseType: 'office_supplies',
        suggestedName: 'Office Supplies for Marketing Department Expense',
        accountType: 'expense',
        startingBalance: '1000', // $1000 starting balance
        balanceDate: new Date().toISOString().split('T')[0] // Today's date
      },
      userId,
      MessagePriority.HIGH,
      context.conversationId
    );
    
    const requestResult = {
      success: true,
      message: `I've requested the creation of a new GL account for "Office Supplies for Marketing Department" with a starting balance of $1000. The General Ledger agent will process this request.`
    };
    
    console.log('Request result:', requestResult);
    
    // 2. GL agent processes pending messages
    console.log('2. GL agent processing pending messages...');
    await glAgent.checkPendingMessages(context);
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error during test:', error);
  }
}

/**
 * Run the test
 */
export async function runAgentCommunicationTest(userId: string): Promise<string> {
  try {
    await testAPGLCommunication(userId);
    return 'Agent communication test completed successfully!';
  } catch (error) {
    console.error('Test failed:', error);
    return `Agent communication test failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}
