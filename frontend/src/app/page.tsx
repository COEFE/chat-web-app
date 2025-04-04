import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to the login page when someone visits the root URL
  redirect('/login');
  
  // This won't be rendered because of the redirect
  return null;
}
