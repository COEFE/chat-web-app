"use client";

import { useEffect } from "react";
import { redirect } from "next/navigation";

export default function AccountsPayableRedirect() {
  // Redirect to the vendors page
  useEffect(() => {
    redirect("/dashboard/accounts-payable/vendors");
  }, []);
  
  // Fallback for cases where immediate redirect doesn't work
  return (
    <div className="container mx-auto py-10 flex items-center justify-center">
      <p>Redirecting to vendors management...</p>
    </div>
  );
}
