'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AgentChatInterface from '@/components/dashboard/AgentChatInterface';
import { useAuth } from '@/context/AuthContext';

/**
 * Accounting Assistant Page
 * This page demonstrates the multi-agent accounting system
 */
export default function AccountingAssistantPage() {
  const { user } = useAuth();

  return (
    <div className="container mx-auto py-4 space-y-4 px-2 sm:px-4 sm:py-6 sm:space-y-6">
      {/* Info Card - Hidden on smaller screens */}
      <Card className="hidden sm:block">
        <CardHeader className="sm:pb-2">
          <CardTitle>Accounting Assistant</CardTitle>
          <CardDescription>
            Our multi-agent accounting system can answer questions about invoices, GL codes, reconciliation, and more
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-lg font-medium mb-2">Specialized Accounting Agents</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>GL Agent - For GL codes and journal entries</li>
                <li>Invoice Agent - Coming soon</li>
                <li>Reconciliation Agent - Coming soon</li>
                <li>Accounts Payable Agent - Coming soon</li>
              </ul>
              
              <div className="mt-4">
                <h3 className="text-lg font-medium mb-2">Try asking about:</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>What GL code should I use for office supplies?</li>
                  <li>How do I record a prepaid expense?</li>
                  <li>Explain the difference between debit and credit</li>
                </ul>
              </div>
            </div>
            
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                This is a preview of our new multi-agent accounting assistant. It currently routes your questions to 
                specialized agents based on the content of your query. At launch, only the GL Agent is fully implemented,
                but other agents will be added soon.
              </p>
              
              <p className="text-sm text-muted-foreground">
                The system keeps track of your conversation and provides each agent with the necessary context to
                give you the most accurate answers possible.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Mobile-friendly compact info - Only visible on mobile */}
      <div className="sm:hidden">
        <h2 className="text-xl font-bold mb-1">Accounting Assistant</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Ask me about invoices, GL codes, reconciliation, and more
        </p>
      </div>
      
      {/* The main agent chat interface - Always full width on mobile */}
      <div className="w-full">
        <AgentChatInterface 
          conversationId={`user-${user?.uid || 'guest'}-${Date.now()}`}
          className="w-full" 
        />
      </div>
    </div>
  );
}
