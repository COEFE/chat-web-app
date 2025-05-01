"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import GLCodeUpload from "@/components/GLCodeUpload";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Database } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";

interface GLCode {
  id: number;
  gl_code: string;
  description: string;
  content: string;
}

export default function GLCodesPage() {
  const [activeTab, setActiveTab] = useState("upload");
  const [codes, setCodes] = useState<GLCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  const fetchGLCodes = async () => {
    setIsLoading(true);
    try {
      // Get Firebase token
      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('You must be logged in to access GL codes');
      }
      
      // Fetch GL codes (and setup DB if missing)
      const res = await fetch('/api/gl-codes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.setupRequired) {
          toast({
            title: "Setting up database...",
            description: "Initializing GL codes database",
            variant: "default",
          });
          const setupRes = await fetch('/api/gl-codes/db-setup', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          });
          const setupData = await setupRes.json();
          if (!setupRes.ok) {
            throw new Error(setupData.error || 'Database setup failed');
          }
          toast({
            title: "Database setup successful",
            description: setupData.message,
            variant: "default",
          });
          // Retry fetching GL codes after setup
          return fetchGLCodes();
        }
        throw new Error(data.error || 'Failed to fetch GL codes');
      }
      setCodes(data.glCodes || []);
    } catch (error) {
      // If token invalid or unauthorized, redirect to login
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        router.push('/login');
        return;
      }
      console.error('Error fetching GL codes:', error);
      toast({
        title: "Error fetching GL codes",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch GL codes when viewing the manage tab
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "manage") {
      fetchGLCodes();
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">GL Code Management</h1>
      </div>
        
        <Tabs defaultValue="upload" onValueChange={handleTabChange}>
          <TabsList className="mb-4">
            <TabsTrigger value="upload" className="flex items-center">
              <Upload className="w-4 h-4 mr-2" />
              Upload GL Codes
            </TabsTrigger>
            <TabsTrigger value="manage" className="flex items-center">
              <Database className="w-4 h-4 mr-2" />
              Manage GL Codes
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="upload" className="space-y-4">
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Upload GL Codes</CardTitle>
                <CardDescription>
                  Upload your chart of accounts to enable AI assistance with your accounting code inquiries.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GLCodeUpload />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="manage" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Manage GL Codes</CardTitle>
                  <CardDescription>
                    View and manage your GL codes in the knowledge base.
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  onClick={fetchGLCodes}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                </Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : codes.length > 0 ? (
                  <div className="border rounded-md overflow-auto max-h-[500px]">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-200 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">GL Code</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Description</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Content</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 text-black">
                        {codes.map((code) => (
                          <tr key={code.id} className="odd:bg-white even:bg-gray-100">
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">{code.gl_code}</td>
                            <td className="px-4 py-2 text-sm">{code.description}</td>
                            <td className="px-4 py-2 text-sm max-w-md truncate">{code.content}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No GL codes found. Upload some codes using the upload tab.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  );
}
