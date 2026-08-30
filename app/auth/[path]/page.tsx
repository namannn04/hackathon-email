'use client';

import { AuthView } from '@neondatabase/auth-ui';
import { useParams, useSearchParams } from 'next/navigation';

export default function NeonAuthPage() {
  const params = useParams<{ path: string }>();
  const search = useSearchParams();
  const requestedCallback = search.get('callbackURL');
  const callbackURL = requestedCallback?.startsWith('/') && !requestedCallback.startsWith('//') ? requestedCallback : '/';
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f5] p-5">
      <div className="w-full max-w-md">
        <AuthView path={params.path} callbackURL={callbackURL} />
      </div>
    </main>
  );
}
