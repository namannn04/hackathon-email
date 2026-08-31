'use client';

import { NeonAuthUIProvider } from '@neondatabase/auth-ui';
import { authClient } from '@/lib/auth/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      redirectTo="/dashboard"
      defaultTheme="light"
      social={{ providers: ['google'] }}
      Link={Link}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
