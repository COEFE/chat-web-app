import { redirect } from 'next/navigation';

interface ShareRedirectProps {
  params: { shareId: string };
}

export default function ShareRedirect({ params }: ShareRedirectProps) {
  const { shareId } = params;
  redirect(`/shared/${shareId}`);
}
