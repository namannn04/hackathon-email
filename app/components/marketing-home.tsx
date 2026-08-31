import Link from 'next/link';
import { PublicFooter, PublicHeader } from './public-chrome';

const steps = [
  {
    title: 'Organizer sets up the event',
    body: 'Create an event, upload the participant list once as CSV or XLSX, and write the mail task: a fixed To address, subject, and body.',
  },
  {
    title: 'Volunteers join by invitation',
    body: 'Share an event invitation link. It grants access to that one event only — signing in on its own opens nothing.',
  },
  {
    title: 'One set, one Gmail message',
    body: 'A volunteer picks a set, previews every address, chooses one connected Gmail account, and sends. All recipients go in BCC.',
  },
];

const guarantees = [
  {
    title: 'Send-only Gmail access',
    body: 'Relay asks for gmail.send and basic identity scopes. It cannot read, search, modify, or delete anything in your mailbox.',
  },
  {
    title: 'Duplicate-send protection',
    body: 'Idempotency keys, expiring send leases, and deterministic Message-IDs protect normal retries and concurrent clicks. Ambiguous provider failures stay visible for review.',
  },
  {
    title: 'Automatic record keeping',
    body: 'Every send writes an activity entry with the sender, set number, BCC count, and Gmail account used — no shared spreadsheet.',
  },
  {
    title: 'Sets sized for Gmail',
    body: 'Lists are split into sets of about 300 BCC recipients, staying under Gmail’s 500-recipient limit per message.',
  },
];

export function MarketingHome() {
  return (
    <div className="min-h-screen bg-[#f7f7f5] text-[#20201d]">
      <PublicHeader />

      <main>
        <section className="mx-auto max-w-5xl px-5 pb-14 pt-16 sm:px-8 sm:pb-20 sm:pt-24">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#8a8a82]">Relay</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-5xl">
            Hackathon outreach, without the spreadsheet shuffle.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#5c5c55]">
            Relay lets an organizer import a participant list once and hand volunteers a clear queue of recipient sets.
            Each volunteer sends one BCC message per set from their own Gmail account, and Relay records exactly what
            went out.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/auth/sign-up" className="inline-flex h-11 items-center rounded-xl bg-[#263d32] px-5 text-sm font-semibold text-white">
              Create an account
            </Link>
            <Link href="/auth/sign-in" className="inline-flex h-11 items-center rounded-xl border border-[#d6d6cf] bg-white px-5 text-sm font-semibold">
              Sign in
            </Link>
          </div>
          <p className="mt-4 text-xs leading-5 text-[#92928b]">
            Accounts are created through Neon Auth. Event access still comes only from an organizer’s invitation link.
          </p>
        </section>

        <section className="border-y border-[#deded8] bg-white">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">How it works</h2>
            <ol className="mt-8 grid gap-5 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="rounded-[22px] border border-[#e4e4de] bg-[#fafaf8] p-6">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e5ebe7] text-sm font-semibold text-[#263d32]">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-semibold tracking-[-0.01em]">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#63635c]">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">What Relay guarantees</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {guarantees.map((item) => (
              <article key={item.title} className="rounded-[22px] border border-[#deded8] bg-white p-6">
                <h3 className="text-base font-semibold tracking-[-0.01em]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#63635c]">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-[#deded8] bg-white">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Your Google account data</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#5c5c55]">
              Connecting Gmail is separate from signing in. When you connect an account, Relay requests only{' '}
              <code className="rounded bg-[#f1f1ec] px-1.5 py-0.5 text-[13px]">openid</code>,{' '}
              <code className="rounded bg-[#f1f1ec] px-1.5 py-0.5 text-[13px]">email</code>,{' '}
              <code className="rounded bg-[#f1f1ec] px-1.5 py-0.5 text-[13px]">profile</code>, and{' '}
              <code className="rounded bg-[#f1f1ec] px-1.5 py-0.5 text-[13px]">gmail.send</code>. Messages are sent only
              when you press send. Stored tokens are encrypted, and you can disconnect an account inside Relay or revoke
              access at{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[#263d32] underline underline-offset-4"
              >
                myaccount.google.com/permissions
              </a>{' '}
              at any time.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#5c5c55]">
              Relay’s use and transfer of information received from Google APIs adheres to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[#263d32] underline underline-offset-4"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/privacy" className="inline-flex h-11 items-center rounded-xl border border-[#d6d6cf] bg-[#fafaf8] px-5 text-sm font-semibold">
                Read the privacy policy
              </Link>
              <Link href="/terms" className="inline-flex h-11 items-center rounded-xl border border-[#d6d6cf] bg-[#fafaf8] px-5 text-sm font-semibold">
                Read the terms of service
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
