import { Metadata } from "next";
import { SemanticJournalSearch } from "@/components/journals/SemanticJournalSearch";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "AI Transaction Search",
  description: "Search for similar transactions using AI",
};

export default function JournalAISearchPage() {
  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader 
        heading="AI Transaction Search" 
        subheading="Find semantically similar transactions using vector embeddings" 
      />
      
      <div className="grid gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium mb-4 flex items-center">
            <span className="mr-2">🔍</span>
            <span>Search by meaning, not just keywords</span>
          </h2>
          <p className="text-gray-500 mb-6">
            Unlike traditional search that only matches exact keywords, this AI-powered search understands the meaning behind your queries.
            Try searching for concepts like "office supplies", "client payments", or "recurring monthly expenses" even if those exact words don't appear in your transactions.
          </p>
          
          <SemanticJournalSearch />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-medium mb-2">Search Tips</h3>
            <ul className="list-disc list-inside text-sm text-gray-500 space-y-1">
              <li>Use natural language (e.g., "rent payments")</li>
              <li>Try descriptions of what purchases were for</li>
              <li>Be specific about vendors or payment types</li>
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-medium mb-2">How It Works</h3>
            <p className="text-sm text-gray-500">
              Each transaction is converted into a vector embedding that captures its semantic meaning.
              Your search query is similarly converted, allowing the system to find conceptually similar entries.
            </p>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-medium mb-2">Examples</h3>
            <ul className="list-disc list-inside text-sm text-gray-500 space-y-1">
              <li>"Monthly subscriptions"</li>
              <li>"Travel expenses"</li>
              <li>"Client reimbursements"</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
