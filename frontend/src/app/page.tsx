import Link from 'next/link';
import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to the login page when someone visits the root URL
  redirect('/login');
}
