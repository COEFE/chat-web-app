"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import TestCreditCardAgentFullFlowButton from "@/components/admin/TestCreditCardAgentFullFlowButton";
import SimpleTestCreditCardExtractedDataButton from "@/components/admin/SimpleTestCreditCardExtractedDataButton";
import TestCreditCardEnhancementsButton from "@/components/admin/TestCreditCardEnhancementsButton";
import { Button } from "@/components/ui/button";

export default function AgentTestsPage() {
  return (
    <div className="container mx-auto py-4">
      <h1 className="text-2xl font-bold mb-4">Agent Tests</h1>
      
      <Tabs defaultValue="credit-card" className="w-full">
        <TabsList>
          <TabsTrigger value="credit-card">Credit Card Agent</TabsTrigger>
          <TabsTrigger value="ap-agent">AP Agent</TabsTrigger>
          <TabsTrigger value="gl-agent">GL Agent</TabsTrigger>
        </TabsList>
        
        <TabsContent value="credit-card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TestCreditCardAgentFullFlowButton />
            
            <Card>
              <CardHeader>
                <CardTitle>Test Credit Card Enhancements</CardTitle>
                <CardDescription>
                  This test runs the AI-powered journal type selector and ensures payment journal entries are posted.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TestCreditCardEnhancementsButton />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Test Credit Card Extracted Data Transfer</CardTitle>
                <CardDescription>
                  This test verifies that extracted statement data is properly transferred to the Credit Card Agent
                  and used for transaction processing.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  This test simulates the flow of data from PDF extraction to transaction processing,
                  using American Express 2009 as the test account.
                </p>
                <SimpleTestCreditCardExtractedDataButton />
              </CardContent>
            </Card>
          </div>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>About Credit Card Agent Tests</CardTitle>
              <CardDescription>
                These tests help verify the functionality of the Credit Card Agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                <strong>Full Flow Test:</strong> Tests the entire flow from account creation to transaction processing and journal entry creation.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                <strong>Extracted Data Test:</strong> Specifically tests the transfer of extracted statement data from PDF processing to transaction handling.
                This test verifies that the agent correctly uses the extracted data for transaction processing.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="ap-agent">
          <Card>
            <CardHeader>
              <CardTitle>AP Agent Tests</CardTitle>
              <CardDescription>
                Tests for the Accounts Payable Agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                AP Agent tests will be added in a future update.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="gl-agent">
          <Card>
            <CardHeader>
              <CardTitle>GL Agent Tests</CardTitle>
              <CardDescription>
                Tests for the General Ledger Agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                GL Agent tests will be added in a future update.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
