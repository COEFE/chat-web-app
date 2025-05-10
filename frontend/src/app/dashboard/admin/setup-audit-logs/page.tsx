"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, CheckCircle, AlertCircle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/firebaseConfig";

export default function SetupAuditLogs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [isDev, setIsDev] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    message?: string;
    error?: string;
  } | null>(null);
  
  useEffect(() => {
    const getToken = async () => {
      if (user) {
        try {
          const idToken = await user.getIdToken();
          setToken(idToken);
        } catch (error) {
          console.error("Failed to get ID token:", error);
        }
      }
    };
    
    getToken();
  }, [user]);

  const setupAuditLogs = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      // In development mode, we can bypass the token for debugging
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      
      // Only include the authorization header if not in dev mode and token exists
      if (!isDev && token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch("/api/setup-audit-logs", {
        method: "POST",
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to set up audit logs table");
      }

      setResult({
        success: true,
        message: data.message || "Audit logs table set up successfully!",
      });

      toast({
        title: "Success",
        description: "Audit logs table has been set up successfully.",
        variant: "default",
      });
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || "An unexpected error occurred",
      });

      toast({
        title: "Error",
        description: error.message || "Failed to set up audit logs table",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex flex-col items-center max-w-3xl mx-auto">
        <Card className="w-full shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Set Up Audit Logs</CardTitle>
            <CardDescription>
              Create the database table required for storing audit logs. This is required for the
              multi-agent system and other features that use audit logging.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-md">
                <h3 className="font-semibold">What This Will Do:</h3>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Create the <code>audit_logs</code> table in your database if it doesn't already exist</li>
                  <li>Create necessary indexes for efficient querying</li>
                  <li>Record this migration in the <code>db_migrations</code> table</li>
                </ul>
              </div>

              {result && (
                <div
                  className={`p-4 rounded-md ${
                    result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                  }`}
                >
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      {result.success ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                    <div className="ml-3">
                      <h3
                        className={`text-sm font-medium ${
                          result.success ? "text-green-800" : "text-red-800"
                        }`}
                      >
                        {result.success ? "Success" : "Error"}
                      </h3>
                      <div
                        className={`mt-1 text-sm ${
                          result.success ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {result.message || result.error}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/admin/audit-logs">View Audit Logs</Link>
            </Button>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsDev(!isDev)}
                className={isDev ? "bg-amber-100" : ""}
                type="button"
              >
                <ShieldAlert className={`mr-2 h-4 w-4 ${isDev ? "text-amber-600" : "text-gray-400"}`} />
                {isDev ? "Dev Mode: ON" : "Dev Mode: OFF"}
              </Button>
              
              <Button onClick={() => setupAuditLogs()} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting Up...
                  </>
                ) : (
                  "Set Up Audit Logs Table"
                )}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
