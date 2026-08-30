import Link from 'next/link';
import { legal } from '@/lib/legal/config';

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#deded8] bg-[#f7f7f5]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Relay home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#263d32] text-sm font-bold text-white">R</span>
          <div>
            <p className="text-[15px] font-semibold leading-none">Relay</p>
            <p className="mt-1 text-[11px] text-[#73736c]">Hackathon outreach</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/auth/sign-in" className="inline-flex h-10 items-center rounded-xl border border-[#d6d6cf] bg-white px-4 text-sm font-semibold">
            Sign in
          </Link>
          <Link href="/auth/sign-up" className="hidden h-10 items-center rounded-xl bg-[#263d32] px-4 text-sm font-semibold text-white sm:inline-flex">
            Create account
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-[#deded8] bg-[#f7f7f5]">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-xs text-[#77776f] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>
          © {new Date().getFullYear()} {legal.serviceName}. Volunteer-run event outreach.
        </p>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-4">
          <Link href="/" className="underline-offset-4 hover:underline">Home</Link>
          <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy policy</Link>
          <Link href="/terms" className="underline-offset-4 hover:underline">Terms of service</Link>
          <a href={`mailto:${legal.contactEmail}`} className="underline-offset-4 hover:underline">Contact</a>
        </nav>
      </div>
    </footer>
  );
}

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f7f5] text-[#20201d]">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#8a8a82]">Last updated {legal.lastUpdated}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-[#63635c]">{intro}</p>
        <div className="mt-10 space-y-8">{children}</div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-[#deded8] bg-white p-6 sm:p-8">
      <h2 className="text-lg font-semibold tracking-[-0.02em]">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-[#5c5c55] [&_a]:font-medium [&_a]:text-[#263d32] [&_a]:underline [&_a]:underline-offset-4 [&_li]:leading-6 [&_strong]:font-semibold [&_strong]:text-[#34342f] [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
