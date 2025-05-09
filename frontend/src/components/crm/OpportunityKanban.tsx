"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getAuth } from "firebase/auth";
import { DollarSign, Calendar, Users, BarChart, Plus, User, ChevronRight } from "lucide-react";

interface Opportunity {
  id: number;
  customer_id: number;
  customer_name: string; 
  title: string;
  description?: string;
  stage: string;
  value: number;
  probability: number;
  expected_close_date: string;
  created_at: string;
  updated_at: string;
}

interface Stage {
  id: string;
  name: string;
  description: string;
  color?: string;
}

interface OpportunityKanbanProps {
  customerId?: number; // Optional - if provided, shows only opportunities for this customer
}

export function OpportunityKanban({ customerId }: OpportunityKanbanProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [showOpportunityDialog, setShowOpportunityDialog] = useState(false);
  
  // Define pipeline stages
  const stages: Stage[] = [
    { id: "lead", name: "Lead", description: "Initial contact", color: "bg-blue-500" },
    { id: "qualified", name: "Qualified", description: "Qualified prospect", color: "bg-purple-500" },
    { id: "proposal", name: "Proposal", description: "Proposal sent", color: "bg-amber-500" },
    { id: "negotiation", name: "Negotiation", description: "In negotiation", color: "bg-orange-500" },
    { id: "closed_won", name: "Closed Won", description: "Deal won", color: "bg-green-500" },
    { id: "closed_lost", name: "Closed Lost", description: "Deal lost", color: "bg-red-500" },
  ];
  
  // In a real implementation, this would fetch from the API
  // For now, using mock data that matches our Opportunity interface
  useEffect(() => {
    const fetchOpportunities = async () => {
      setIsLoading(true);
      try {
        // This would be a real API call in the implementation
        // const auth = getAuth();
        // const token = await auth.currentUser?.getIdToken();
        
        // const url = customerId 
        //   ? `/api/opportunities?customer_id=${customerId}`
        //   : '/api/opportunities';
        
        // const response = await fetch(url, {
        //   headers: {
        //     Authorization: `Bearer ${token}`
        //   }
        // });
        
        // if (!response.ok) {
        //   throw new Error(`Error fetching opportunities: ${response.status}`);
        // }
        
        // const data = await response.json();
        // setOpportunities(data.opportunities);
        
        // Mock data for now
        const mockOpportunities: Opportunity[] = [
          {
            id: 1,
            customer_id: 1,
            customer_name: "Acme Corp",
            title: "Enterprise Software License",
            description: "Annual enterprise software license renewal with potential upgrades",
            stage: "qualified",
            value: 25000,
            probability: 60,
            expected_close_date: "2025-07-15",
            created_at: "2025-04-10T10:00:00Z",
            updated_at: "2025-05-05T14:30:00Z"
          },
          {
            id: 2,
            customer_id: 2,
            customer_name: "TechStart Inc",
            title: "Implementation Services",
            description: "Implementation and training services for new platform",
            stage: "proposal",
            value: 15000,
            probability: 70,
            expected_close_date: "2025-06-30",
            created_at: "2025-04-22T10:00:00Z",
            updated_at: "2025-05-04T09:15:00Z"
          },
          {
            id: 3,
            customer_id: 1,
            customer_name: "Acme Corp",
            title: "Hardware Upgrade",
            description: "Server infrastructure upgrade",
            stage: "negotiation",
            value: 45000,
            probability: 50,
            expected_close_date: "2025-08-15",
            created_at: "2025-04-05T10:00:00Z",
            updated_at: "2025-05-02T16:45:00Z"
          },
          {
            id: 4,
            customer_id: 3,
            customer_name: "Global Services Ltd",
            title: "Consulting Project",
            description: "Strategic consulting engagement",
            stage: "lead",
            value: 10000,
            probability: 30,
            expected_close_date: "2025-09-01",
            created_at: "2025-05-01T10:00:00Z",
            updated_at: "2025-05-01T10:00:00Z"
          },
          {
            id: 5,
            customer_id: 4,
            customer_name: "Innovative Solutions",
            title: "Support Contract",
            description: "Premier support contract renewal",
            stage: "closed_won",
            value: 12000,
            probability: 100,
            expected_close_date: "2025-05-05",
            created_at: "2025-03-15T10:00:00Z",
            updated_at: "2025-05-05T11:20:00Z"
          },
          {
            id: 6,
            customer_id: 5,
            customer_name: "City Services",
            title: "Mobile App Development",
            description: "Custom mobile application development project",
            stage: "closed_lost",
            value: 30000,
            probability: 0,
            expected_close_date: "2025-04-30",
            created_at: "2025-02-10T10:00:00Z",
            updated_at: "2025-04-28T15:30:00Z"
          }
        ];
        
        // Filter by customer ID if provided
        const filteredOpportunities = customerId 
          ? mockOpportunities.filter(opp => opp.customer_id === customerId)
          : mockOpportunities;
          
        setOpportunities(filteredOpportunities);
      } catch (error) {
        console.error("Error fetching opportunities:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchOpportunities();
  }, [customerId]);
  
  const getStageOpportunities = (stageId: string) => {
    return opportunities.filter(opp => opp.stage === stageId);
  };
  
  const getTotalValueForStage = (stageId: string) => {
    return getStageOpportunities(stageId)
      .reduce((sum, opp) => sum + opp.value, 0);
  };
  
  const handleCardClick = (opportunity: Opportunity) => {
    setSelectedOpportunity(opportunity);
    setShowOpportunityDialog(true);
  };
  
  const stageActiveItemCount = (stageId: string) => {
    return getStageOpportunities(stageId).length;
  };
  
  const getTotalPipelineValue = () => {
    // Exclude closed lost opportunities
    return opportunities
      .filter(opp => opp.stage !== 'closed_lost')
      .reduce((sum, opp) => sum + opp.value, 0);
  };
  
  const getWeightedPipelineValue = () => {
    // Exclude closed lost opportunities and apply probability weighting
    return opportunities
      .filter(opp => opp.stage !== 'closed_lost')
      .reduce((sum, opp) => sum + (opp.value * opp.probability / 100), 0);
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground animate-pulse">Loading opportunity pipeline...</div>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Opportunity Pipeline</h2>
          <p className="text-muted-foreground">
            {opportunities.length} opportunities worth ${getTotalPipelineValue().toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Weighted Value</p>
            <p className="text-lg font-semibold">${getWeightedPipelineValue().toLocaleString()}</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Opportunity
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 pb-6 overflow-x-auto">
        {stages.map(stage => (
          <div key={stage.id} className="min-w-[250px] space-y-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${stage.color}`}></div>
                <h3 className="text-sm font-medium">{stage.name}</h3>
              </div>
              <div className="text-muted-foreground text-xs">
                {stageActiveItemCount(stage.id)} items
              </div>
            </div>
            <div className="text-xs text-muted-foreground mb-1">
              {getTotalValueForStage(stage.id) > 0 && 
                `$${getTotalValueForStage(stage.id).toLocaleString()}`
              }
            </div>
            
            <div className="space-y-2 min-h-[200px]">
              {getStageOpportunities(stage.id).map(opportunity => (
                <Card 
                  key={opportunity.id} 
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleCardClick(opportunity)}
                >
                  <CardHeader className="p-3 pb-0">
                    <CardTitle className="text-sm font-medium">{opportunity.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 py-2 text-xs">
                    <div className="flex items-center text-muted-foreground mb-1">
                      <Users className="h-3 w-3 mr-1" />
                      {opportunity.customer_name}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <DollarSign className="h-3 w-3 mr-1" />
                        <span>{opportunity.value.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center">
                        <BarChart className="h-3 w-3 mr-1" />
                        <span>{opportunity.probability}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Opportunity details dialog */}
      <Dialog open={showOpportunityDialog} onOpenChange={setShowOpportunityDialog}>
        <DialogContent className="sm:max-w-[500px]">
          {selectedOpportunity && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedOpportunity.title}</DialogTitle>
                <DialogDescription>
                  Opportunity #{selectedOpportunity.id} - {selectedOpportunity.customer_name}
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-4">
                {selectedOpportunity.description && (
                  <div className="mb-4">
                    <p className="text-sm">{selectedOpportunity.description}</p>
                  </div>
                )}
                
                <Separator className="my-4" />
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Stage</p>
                    <p className="font-medium">
                      {stages.find(s => s.id === selectedOpportunity.stage)?.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Value</p>
                    <p className="font-medium">${selectedOpportunity.value.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Probability</p>
                    <p className="font-medium">{selectedOpportunity.probability}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Expected Close</p>
                    <p className="font-medium">
                      {new Date(selectedOpportunity.expected_close_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <Separator className="my-4" />
                
                <div className="text-sm">
                  <p className="text-muted-foreground">Created</p>
                  <p>{new Date(selectedOpportunity.created_at).toLocaleString()}</p>
                  
                  <p className="text-muted-foreground mt-2">Last Updated</p>
                  <p>{new Date(selectedOpportunity.updated_at).toLocaleString()}</p>
                </div>
              </div>
              
              <DialogFooter className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setShowOpportunityDialog(false)}>
                  Close
                </Button>
                <div className="flex space-x-2">
                  <Button variant="outline">
                    Edit
                  </Button>
                  <Button>
                    <ChevronRight className="h-4 w-4 mr-1" />
                    Move to Next Stage
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
