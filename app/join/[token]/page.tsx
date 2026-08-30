import { requireAppUser } from '@/lib/auth/current-user';
import { acceptEventInvite } from '@/lib/invites/access';
import { getNeonAuth, isNeonAuthConfigured } from '@/lib/auth/neon';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function JoinEventPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: session } = isNeonAuthConfigured() ? await getNeonAuth().getSession() : { data: null };
  if (!session?.user) return <InviteSignIn token={token} />;

  const user = await requireAppUser();
  let eventId: string;
  try {
    const membership = await acceptEventInvite(token, user);
    eventId = membership.eventId;
  } catch (error) {
    return (
      <InviteCard
        title="Invitation unavailable"
        message={error instanceof Error ? error.message : 'This event invitation could not be used.'}
      />
    );
  }
  redirect(`/dashboard?eventId=${eventId}&joined=1`);
}

function InviteSignIn({ token }: { token: string }) {
  const returnTo = `/join/${encodeURIComponent(token)}`;
  return (
    <InviteCard
      title="You’ve been invited to an event"
      message="Sign in once to join this event. Relay creates your volunteer account automatically—there is no separate signup form."
      action={<a href={`/auth/sign-in?callbackURL=${encodeURIComponent(returnTo)}`} className="inline-flex h-11 items-center rounded-xl bg-[#263d32] px-5 text-sm font-semibold text-white">Sign in and join event</a>}
    />
  );
}

function InviteCard({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f5] p-5">
      <section className="w-full max-w-lg rounded-[26px] border border-[#deded8] bg-white p-8 text-center shadow-[0_18px_60px_rgba(30,40,34,0.07)] sm:p-12">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#263d32] text-lg font-bold text-white">R</span>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#707069]">{message}</p>
        <div className="mt-7">{action ?? <Link href="/" className="inline-flex h-11 items-center rounded-xl border border-[#d6d6cf] bg-[#fafaf8] px-5 text-sm font-semibold">Return to Relay</Link>}</div>
      </section>
    </main>
  );
}
