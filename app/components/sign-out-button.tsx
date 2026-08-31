'use client';

import { authClient } from '@/lib/auth/client';
import { useState } from 'react';

export function SignOutButton({ className }: { className?: string }) {
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      disabled={working}
      className={className}
      onClick={async () => {
        setWorking(true);
        setFailed(false);
        try {
          const result = await authClient.signOut();
          if (result.error) throw new Error(result.error.message ?? 'Sign out failed.');
          // A full navigation guarantees that no authenticated server-rendered
          // page or client router cache survives into the next account session.
          window.location.replace('/auth/sign-in?loggedOut=1');
        } catch {
          setFailed(true);
          setWorking(false);
        }
      }}
    >
      {working ? 'Signing out…' : failed ? 'Sign out failed — retry' : 'Sign out'}
    </button>
  );
}
