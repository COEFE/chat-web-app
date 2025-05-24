import { Metadata } from 'next';
import TestAgentCommunicationButton from '@/components/admin/TestAgentCommunicationButton';
import CreateGLAccountWithBalanceButton from '@/components/admin/CreateGLAccountWithBalanceButton';
import TestAPAgentMemoryButton from '@/components/admin/TestAPAgentMemoryButton';
import TestCreditCardAgentBillCreationButton from '@/components/admin/TestCreditCardAgentBillCreationButton';
import TestCreditCardAgentFullFlowButton from '@/components/admin/TestCreditCardAgentFullFlowButton';
import TestCreditCardStatementProcessingButton from '@/components/admin/TestCreditCardStatementProcessingButton';
import RunMigrationsButton from '@/components/admin/RunMigrationsButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Agent Communication Tests',
  description: 'Test the communication between agents',
};

/**
 * Admin page for testing agent communication
 */
export default function AgentTestsPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Agent Communication Tests</h1>
      
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Agent Communication Testing</CardTitle>
            <CardDescription>
              This page provides tools to test the communication between different agents in the system.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4">
              The tests on this page verify that agents can communicate with each other effectively.
              Currently, we can test the AP agent requesting GL account creation from the GL agent.
            </p>
          </CardContent>
        </Card>
        
        <RunMigrationsButton />
        
        <TestAgentCommunicationButton />
        
        <CreateGLAccountWithBalanceButton />
        
        <TestAPAgentMemoryButton />

        <TestCreditCardAgentBillCreationButton />
        
        <TestCreditCardAgentFullFlowButton />
        
        <TestCreditCardStatementProcessingButton />
        
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">AP Agent to GL Agent Communication</h3>
                <p className="text-sm text-gray-500">
                  When the AP agent needs a GL account for an expense that doesn't have a suitable account,
                  it sends a message to the GL agent requesting account creation. The GL agent processes
                  this request and creates an appropriate account.
                </p>
              </div>
              
              <div>
                <h3 className="font-medium">Message Flow</h3>
                <ol className="list-decimal list-inside text-sm text-gray-500 ml-4 space-y-1">
                  <li>AP agent sends a message with action "CREATE_GL_ACCOUNT" to the GL agent</li>
                  <li>GL agent receives and processes the message</li>
                  <li>GL agent creates the account and responds with success or failure</li>
                  <li>AP agent receives the response and can use the new account</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
