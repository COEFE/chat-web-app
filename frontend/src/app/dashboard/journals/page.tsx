"use client";

import { useEffect } from "react";
import { redirect } from "next/navigation";

export default function JournalsRedirect() {
  // Redirect to the transactions page
  useEffect(() => {
    redirect("/dashboard/transactions");
  }, []);
  
  // Fallback for cases where immediate redirect doesn't work
  return (
    <div className="container mx-auto py-10 flex items-center justify-center">
      <p>Redirecting to transactions page...</p>
    </div>
  );
}
