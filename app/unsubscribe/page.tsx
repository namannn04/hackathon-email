import { UnsubscribeForm } from '@/app/components/unsubscribe-form';
import { describeUnsubscribeToken } from '@/lib/unsubscribe/manage';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const token = t ?? '';
  const described = token ? await describeUnsubscribeToken(token) : null;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f5] p-5">
      <section className="w-full max-w-md rounded-[26px] border border-[#deded8] bg-white p-8 text-center shadow-[0_18px_60px_rgba(30,40,34,0.07)] sm:p-10">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#263d32] text-base font-bold text-white">R</span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[#20201d]">Unsubscribe</h1>

        {described ? (
          <>
            <p className="mx-auto mt-2.5 mb-6 max-w-sm text-sm leading-6 text-[#707069]">
              Stop receiving email from the team behind{' '}
              <strong className="font-medium text-[#42513f]">{described.eventName}</strong> — this event and any
              future ones. Because the message went to everyone at once, we need the address it reached.
            </p>
            <UnsubscribeForm token={token} eventName={described.eventName} />
          </>
        ) : (
          <p className="mx-auto mt-2.5 max-w-sm text-sm leading-6 text-[#707069]">
            This unsubscribe link is not valid or has expired. Reply to the email you received and the
            organizer will remove you.
          </p>
        )}

        <p className="mt-6 flex justify-center gap-4 text-xs text-[#92928b]">
          <Link href="/privacy" className="underline underline-offset-4">Privacy policy</Link>
          <Link href="/terms" className="underline underline-offset-4">Terms of service</Link>
        </p>
      </section>
    </main>
  );
}
