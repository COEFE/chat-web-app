"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function BudgetRedirectPage() {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to the dashboard budget page which now has all functionality
    router.push('/dashboard/budget');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-lg">Redirecting to Budget Management...</p>
    </div>
  );
}
