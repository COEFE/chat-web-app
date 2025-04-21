// @ts-nocheck
import { redirect } from 'next/navigation';

export default function ShareRedirect({ params }: any) {
  const { shareId } = params;
  redirect(`/shared/${shareId}`);
}
