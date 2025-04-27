"use client";

import * as React from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import PrepaidWorkflow from "@/components/dashboard/PrepaidWorkflow";

function PrepaidExpensesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Redirect if not logged in
  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    // You can replace this with a proper loading skeleton or component
    return <div>Loading...</div>;
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push("/dashboard")}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Back to Dashboard</span>
        </Button>
        <h1 className="text-lg font-semibold md:text-2xl">Prepaid Expenses Workflow</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Start New Workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <PrepaidWorkflow />
        </CardContent>
      </Card>
    </main>
  );
}

export default PrepaidExpensesPage;
