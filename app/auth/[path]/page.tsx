'use client';

import { AuthView } from '@neondatabase/auth-ui';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useSyncExternalStore } from 'react';

const subscribeToOrigin = () => () => undefined;

export default function NeonAuthPage() {
  const params = useParams<{ path: string }>();
  const search = useSearchParams();
  const requestedCallback = search.get('callbackURL');
  const dashboardPath = requestedCallback?.startsWith('/') && !requestedCallback.startsWith('//')
    ? requestedCallback
    : '/dashboard';
  const browserOrigin = useSyncExternalStore(subscribeToOrigin, () => window.location.origin, () => '');
  // Resolve against the browser's real origin so production auth can never
  // inherit a localhost callback from local environment configuration.
  const callbackURL = browserOrigin ? new URL(dashboardPath, browserOrigin).toString() : dashboardPath;

  return (
    <main className="min-h-screen bg-[#f4f6f2] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-[28px] border border-[#dce2dc] bg-white shadow-[0_24px_80px_rgba(28,45,36,0.10)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden overflow-hidden bg-[#203b2f] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/10" />
          <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-[#a8c3b2]/10" />
          <div className="relative">
            <Link href="/" className="inline-flex items-center gap-3" aria-label="Relay home">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-sm font-bold text-[#203b2f]">R</span>
              <span>
                <span className="block text-base font-semibold">Relay</span>
                <span className="mt-0.5 block text-xs text-white/60">Hackathon outreach</span>
              </span>
            </Link>
          </div>
          <div className="relative max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b9d2c2]">Your sending workspace</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-[-0.045em]">Move every campaign forward, one clear set at a time.</h1>
            <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">Sign in once to reach your dashboard, event queue, Gmail connections, and sending history.</p>
          </div>
          <div className="relative grid grid-cols-3 gap-3 text-xs text-white/65">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><span className="block font-semibold text-white">Private</span><span className="mt-1 block">Invite-only events</span></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><span className="block font-semibold text-white">Safe</span><span className="mt-1 block">Preview before send</span></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><span className="block font-semibold text-white">Tracked</span><span className="mt-1 block">Automatic history</span></div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-8 inline-flex items-center gap-2 lg:hidden" aria-label="Relay home">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#203b2f] text-sm font-bold text-white">R</span>
              <span className="text-base font-semibold">Relay</span>
            </Link>
            <p className="mb-5 text-sm leading-6 text-[#6c746d]">After you continue, we’ll take you straight to your dashboard.</p>
            <AuthView path={params.path} callbackURL={callbackURL} redirectTo={callbackURL} />
            <p className="mt-6 text-center text-xs leading-5 text-[#8a918b]">By continuing, you agree to Relay’s <Link href="/terms" className="font-medium text-[#3d5e4d] underline underline-offset-4">terms</Link> and <Link href="/privacy" className="font-medium text-[#3d5e4d] underline underline-offset-4">privacy policy</Link>.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
