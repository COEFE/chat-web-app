"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { VendorForm } from "@/components/accounts-payable/VendorForm";
import { useToast } from "@/components/ui/use-toast";

export default function NewVendorPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVendorFormClose = (refreshData = false) => {
    if (refreshData) {
      toast({
        title: "Success",
        description: "Vendor was created successfully",
      });
    }
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
          {/* The VendorForm will appear in a dialog by default, but we'll handle that by modifying the component */}
          <VendorFormWrapper onClose={handleVendorFormClose} />
        </CardContent>
      </Card>
    </div>
  );
}

// This wrapper modifies how the VendorForm is rendered
function VendorFormWrapper({ onClose }: { onClose: (refreshData?: boolean) => void }) {
  // We're using the existing VendorForm but we need to modify its appearance
  // since it normally appears in a dialog
  
  return (
    <div className="p-1">
      <VendorForm 
        vendor={null} 
        onClose={onClose}
        standalone={true} // Pass a prop to indicate this is a standalone form
      />
    </div>
  );
}
