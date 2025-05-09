"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { VendorForm } from "@/components/accounts-payable/VendorForm";
import { useToast } from "@/components/ui/use-toast";

export default function AddVendorPage() {
  const router = useRouter();
  const { toast } = useToast();

  const handleVendorFormClose = (refreshData = false) => {
    if (refreshData) {
      toast({
        title: "Success",
        description: "Vendor created successfully",
      });
    }
    // Redirect back to vendors list
    router.push("/dashboard/accounts-payable/vendors");
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          className="mr-2" 
          onClick={() => router.push("/dashboard/accounts-payable/vendors")}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Vendors
        </Button>
        <h1 className="text-3xl font-bold">Add New Vendor</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vendor Information</CardTitle>
          <CardDescription>
            Create a new vendor to use in bills and payments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VendorForm 
            vendor={null} 
            onClose={handleVendorFormClose}
            standalone={true}
          />
        </CardContent>
      </Card>
    </div>
  );
}
