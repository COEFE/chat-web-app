"use client";

import React, { useState, useEffect } from "react";
import { auth } from "@/lib/firebaseConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Check, Loader2, InfoIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function EmbeddingSetup() {
  const [apiKey, setApiKey] = useState("");
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<null | {
    success: boolean;
    message: string;
    processed?: number;
    embedded?: number;
  }>(null);
  const [apiStatus, setApiStatus] = useState<null | {
    apiKeyStatus: string;
    message: string;
    hasKeyInEnv: boolean;
    keyLength?: number;
  }>(null);

  const handleCheckApiKey = async () => {
    setChecking(true);
    setApiStatus(null);
    
    try {
      // Get current Firebase user
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error('You must be logged in to check API status');
      }
      
      // Get fresh ID token from Firebase
      const authToken = await user.getIdToken(true);
      
      const response = await fetch(`/api/config/openai-status`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to check API key status');
      }
      
      const data = await response.json();
      setApiStatus({
        apiKeyStatus: data.apiKeyStatus,
        message: data.message,
        hasKeyInEnv: data.hasKeyInEnv,
        keyLength: data.keyLength
      });
    } catch (err: any) {
      console.error('Error checking API key status:', err);
      setApiStatus({
        apiKeyStatus: 'error',
        message: err.message || 'An error occurred while checking API key status',
        hasKeyInEnv: false
      });
    } finally {
      setChecking(false);
    }
  };
  
  // Check API key status on component mount
  useEffect(() => {
    handleCheckApiKey();
  }, []);

  const handleGenerateEmbeddings = async () => {
    setGenerating(true);
    setResult(null);
    
    try {
      // Get current Firebase user
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error('You must be logged in to generate embeddings');
      }
      
      // Get fresh ID token from Firebase
      const authToken = await user.getIdToken(true);
      
      // First, save API key if provided
      if (apiKey.trim()) {
        const saveKeyResponse = await fetch(`/api/config/openai-key`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ key: apiKey })
        });
        
        if (!saveKeyResponse.ok) {
          const errorData = await saveKeyResponse.json();
          throw new Error(errorData.error || 'Failed to save API key');
        }
      }
      
      // Then, generate embeddings
      const generateResponse = await fetch(`/api/journals/generate-embeddings`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!generateResponse.ok) {
        const errorData = await generateResponse.json();
        throw new Error(errorData.error || 'Failed to generate embeddings');
      }
      
      const data = await generateResponse.json();
      setResult({
        success: true,
        message: data.message,
        processed: data.processed,
        embedded: data.embedded
      });
      
      // Check API key status after saving key
      if (apiKey.trim()) {
        await handleCheckApiKey();
      }
    } catch (err: any) {
      console.error('Error generating embeddings:', err);
      setResult({
        success: false,
        message: err.message || 'An error occurred while generating embeddings'
      });
    } finally {
      setGenerating(false);
      setApiKey("");
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>AI Search Setup</CardTitle>
        <CardDescription>
          Generate embeddings for your journal entries to enable AI-powered semantic search
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="setup">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="diagnostic">Diagnostic</TabsTrigger>
          </TabsList>
          
          <TabsContent value="setup" className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="openai-key">
                OpenAI API Key (required for AI search)
              </label>
              <Input
                id="openai-key"
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Your API key is stored securely in your .env.local file
              </p>
            </div>
            
            {result && (
              <Alert variant={result.success ? "default" : "destructive"}>
                {result.success ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertTitle>{result.success ? "Success" : "Error"}</AlertTitle>
                <AlertDescription>{result.message}</AlertDescription>
                {result.success && result.processed !== undefined && (
                  <div className="mt-2 text-sm">
                    Processed {result.processed} journal lines, generated {result.embedded} embeddings
                  </div>
                )}
              </Alert>
            )}
            
            <Button 
              onClick={handleGenerateEmbeddings} 
              disabled={generating}
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Embeddings...
                </>
              ) : (
                "Generate Embeddings for All Journals"
              )}
            </Button>
          </TabsContent>
          
          <TabsContent value="diagnostic" className="space-y-4 pt-4">
            <div className="space-y-2">
              <div className="font-medium">OpenAI API Key Status</div>
              
              {apiStatus ? (
                <Alert variant={apiStatus.hasKeyInEnv ? "default" : "destructive"}>
                  {apiStatus.hasKeyInEnv ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <AlertTitle>
                    {apiStatus.hasKeyInEnv ? "API Key Found" : "API Key Missing"}
                  </AlertTitle>
                  <AlertDescription>
                    {apiStatus.message}
                    {apiStatus.keyLength ? (
                      <div className="mt-1 text-sm">Key length: {apiStatus.keyLength} characters</div>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
              
              <div className="text-sm mt-4">
                <p>If you updated your API key, you may need to:</p>
                <ol className="list-decimal ml-5 mt-2">
                  <li>Restart your Next.js server</li>
                  <li>Then refresh this page</li>
                  <li>Try searching with the AI search again</li>
                </ol>
              </div>
              
              <Button 
                onClick={handleCheckApiKey} 
                disabled={checking}
                className="w-full mt-4"
              >
                {checking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking API Key Status...
                  </>
                ) : (
                  "Check API Key Status"
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
