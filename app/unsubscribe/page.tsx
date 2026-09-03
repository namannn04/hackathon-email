import { UnsubscribeForm } from '@/app/components/unsubscribe-form';
import { describeUnsubscribeToken } from '@/lib/unsubscribe/manage';
import { legal } from '@/lib/legal/config';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const token = t ?? '';
  const target = await describeUnsubscribeToken(token || null);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f5] p-5">
      <section className="w-full max-w-md rounded-[26px] border border-[#deded8] bg-white p-8 text-center shadow-[0_18px_60px_rgba(30,40,34,0.07)] sm:p-10">
        {target.kind === 'task' ? (
          <>
            <Badge tone="neutral">R</Badge>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[#20201d]">Unsubscribe</h1>
            <p className="mx-auto mt-2.5 mb-6 max-w-sm text-sm leading-6 text-[#707069]">
              Stop receiving email from the team behind{' '}
              <strong className="font-medium text-[#42513f]">{target.eventName}</strong> — this event and any
              future ones. Because the message went to everyone at once, we need the address it reached.
            </p>
            <UnsubscribeForm token={token} eventName={target.eventName} />
          </>
        ) : target.kind === 'test' ? (
          <>
            <Badge tone="neutral">✓</Badge>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[#20201d]">Nothing to unsubscribe</h1>
            <p className="mx-auto mt-2.5 max-w-sm text-sm leading-6 text-[#707069]">
              That was a <strong className="font-medium text-[#42513f]">test message</strong>, sent by an
              organizer to their own address to check how it looks. There is no mailing list behind it, so
              there is nothing to opt out of.
            </p>
            <p className="mx-auto mt-4 max-w-sm rounded-2xl border border-[#dbe4dd] bg-[#f7faf8] p-3 text-xs leading-5 text-[#4f6a58]">
              On a real mailing this link asks which address received the message and removes it.
            </p>
          </>
        ) : (
          <>
            <Badge tone="warn">!</Badge>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[#20201d]">This link has expired</h1>
            <p className="mx-auto mt-2.5 max-w-sm text-sm leading-6 text-[#707069]">
              The mailing it belonged to is no longer on record, so we cannot tell which list to remove you
              from. You can still opt out — reply <strong className="font-medium text-[#42513f]">unsubscribe</strong> to
              the email you received, and the organizer will take you off the list.
            </p>
            <p className="mx-auto mt-4 max-w-sm text-xs leading-5 text-[#8b938c]">
              Or write to{' '}
              <a href={`mailto:${legal.contactEmail}?subject=Unsubscribe`} className="font-medium text-[#3d5e4d] underline underline-offset-4">
                {legal.contactEmail}
              </a>
              {' '}and we will handle it.
            </p>
          </>
        )}

        <p className="mt-6 flex justify-center gap-4 text-xs text-[#92928b]">
          <Link href="/privacy" className="underline underline-offset-4">Privacy policy</Link>
          <Link href="/terms" className="underline underline-offset-4">Terms of service</Link>
        </p>
      </section>
    </main>
  );
}

function Badge({ tone, children }: { tone: 'neutral' | 'warn'; children: React.ReactNode }) {
  return (
    <span className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl text-base font-bold ${tone === 'warn' ? 'bg-[#fff0eb] text-[#a14f39]' : 'bg-[#263d32] text-white'}`}>
      {children}
    </span>
  );
}
