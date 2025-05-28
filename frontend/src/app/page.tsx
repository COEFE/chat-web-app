import { redirect } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  // Try to redirect to the login page when someone visits the root URL
  try {
    redirect('/login');
  } catch (error) {
    console.error('Redirect failed:', error);
    // This will only render if the redirect fails for some reason
  }
  
  // Fallback UI in case redirect doesn't work (helps with Vercel deployments)
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30">
      <div className="w-full max-w-md p-8 space-y-6 rounded-xl shadow-md bg-card">
        <h1 className="text-2xl font-bold text-center">Welcome to Expense AI</h1>
        <p className="text-center">Please sign in to continue</p>
        <div className="flex justify-center pt-4">
          <Link 
            href="/login" 
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
