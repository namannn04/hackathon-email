'use client';

import { authClient } from '@/lib/auth/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SignOutButton({ className }: { className?: string }) {
  const [working, setWorking] = useState(false);
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={working}
      className={className}
      onClick={async () => {
        setWorking(true);
        await authClient.signOut();
        router.push('/auth/sign-in');
        router.refresh();
      }}
    >
      {working ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
