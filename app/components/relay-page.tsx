import { getNeonAuth, isNeonAuthConfigured } from '@/lib/auth/neon';
import { isDatabaseConfigured } from '@/lib/db/prisma';
import { RelayApp } from './relay-app';
import { MarketingHome } from './marketing-home';
import type { AppView } from './types';
import Link from 'next/link';

export async function RelayPage({ view, eventId, mailTaskId }: { view: AppView; eventId?: string | null; mailTaskId?: string | null }) {
  if (!isNeonAuthConfigured() || !isDatabaseConfigured()) return <SetupScreen />;
  const { data: session } = await getNeonAuth().getSession();
  if (!session?.user) return view === 'campaign' ? <MarketingHome /> : <SignInScreen />;
  return <RelayApp view={view} eventId={eventId} mailTaskId={mailTaskId} />;
}

function SignInScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f5] p-5">
      <section className="w-full max-w-lg rounded-[26px] border border-[#deded8] bg-white p-8 text-center shadow-[0_18px_60px_rgba(30,40,34,0.07)] sm:p-12">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#263d32] text-lg font-bold text-white">R</span>
        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.04em]">Welcome to Relay</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#707069]">Sign in to open events shared with you, preview one BCC set, connect Gmail, and send.</p>
        <div className="mt-7 flex justify-center gap-2"><Link href="/auth/sign-in" className="inline-flex h-11 items-center rounded-xl bg-[#263d32] px-5 text-sm font-semibold text-white">Sign in</Link><Link href="/auth/sign-up" className="inline-flex h-11 items-center rounded-xl border border-[#d6d6cf] bg-white px-5 text-sm font-semibold">Create account</Link></div>
        <p className="mt-4 text-xs leading-5 text-[#92928b]">Authentication is handled by Neon Auth. Event access still comes only from an organizer’s invitation.</p>
        <p className="mt-3 flex justify-center gap-4 text-xs text-[#92928b]"><Link href="/privacy" className="underline underline-offset-4">Privacy policy</Link><Link href="/terms" className="underline underline-offset-4">Terms of service</Link></p>
      </section>
    </main>
  );
}

function SetupScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f5] p-5">
      <section className="w-full max-w-lg rounded-[26px] border border-[#deded8] bg-white p-8 text-center sm:p-12">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#263d32] text-lg font-bold text-white">R</span>
        <h1 className="mt-6 text-2xl font-semibold">Relay is ready for environment setup</h1>
        <p className="mt-3 text-sm leading-6 text-[#707069]">Enable Neon Auth for this Neon branch, then add its base URL, a cookie secret, and the Prisma PostgreSQL URL listed in <code>.env.example</code>.</p>
      </section>
    </main>
  );
}
