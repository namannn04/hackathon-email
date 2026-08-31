'use client';

import type { AppView, Overview } from './types';
import Link from 'next/link';
import { SignOutButton } from './sign-out-button';

const navItems: Array<{ view: AppView; href: string; marker: string; label: string; hint: string }> = [
  { view: 'campaign', href: '/dashboard', marker: 'D', label: 'Dashboard', hint: 'Events & sending' },
  { view: 'batches', href: '/my-batches', marker: 'G', label: 'Gmail & history', hint: 'Accounts & activity' },
  { view: 'admin', href: '/admin', marker: 'A', label: 'Admin portal', hint: 'Manage workspace' },
];

export function RelayShell({
  overview,
  activeView,
  children,
}: {
  overview: Overview;
  activeView: AppView;
  children: React.ReactNode;
}) {
  const initials = (overview.user.name ?? overview.user.email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen bg-[#f4f6f3] text-[#20201d]">
      <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#dce2dc] bg-[#f4f6f3]/90 px-4 backdrop-blur-xl sm:px-6 md:px-8">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#698572] focus-visible:ring-offset-2" aria-label="Relay dashboard">
          <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#203b2f] text-sm font-bold text-white shadow-[0_8px_20px_rgba(32,59,47,.18)]">R</span>
          <div>
            <p className="text-[15px] font-semibold leading-none tracking-[-0.01em]">Relay</p>
            <p className="mt-1 text-[11px] text-[#737a74]">Hackathon outreach</p>
          </div>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-[#dce2dc] bg-white px-3 py-1.5 text-xs text-[#5e665f] shadow-sm sm:flex">
            <span className="h-2 w-2 rounded-full bg-[#3f8b62] ring-4 ring-[#e8f3eb]" />
            {overview.mockTransport ? 'Safe test mode' : 'Gmail sending enabled'}
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-full border border-[#d7ded8] bg-[#e6ede8] text-xs font-semibold text-[#355443]" title={overview.user.email}>
            {initials || 'U'}
          </div>
          <SignOutButton className="hidden rounded-lg px-2 py-1.5 text-xs font-medium text-[#697169] transition hover:bg-white hover:text-[#2b4436] sm:block" />
          <SignOutButton className="rounded-lg border border-[#d7ded8] bg-white px-2.5 py-2 text-[11px] font-semibold text-[#59635b] sm:hidden" />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] md:grid-cols-[260px_1fr]">
        <aside className="hidden min-h-[calc(100vh-68px)] border-r border-[#dce2dc] px-4 py-6 md:flex md:flex-col lg:px-5">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#919791]">Workspace</p>
          <nav aria-label="Primary navigation" className="space-y-1.5">
            {navItems.map((item) => {
              if (item.view === 'admin' && overview.user.role !== 'ORGANIZER') return null;
              return (
                <Link
                  key={item.view}
                  href={item.href}
                  aria-current={activeView === item.view ? 'page' : undefined}
                  className={`group flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#698572] ${
                    activeView === item.view
                      ? 'border-[#d4e0d7] bg-white font-medium text-[#203b2f] shadow-[0_6px_20px_rgba(34,54,44,.06)]'
                      : 'border-transparent text-[#646c65] hover:border-[#e1e6e1] hover:bg-white/70'
                  }`}
                >
                  <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[11px] font-bold transition ${activeView === item.view ? 'bg-[#203b2f] text-white' : 'bg-[#e8ece8] text-[#687069] group-hover:bg-[#dfe7e1]'}`}>{item.marker}</span>
                  <span className="min-w-0">
                    <span className="block truncate">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-[#929891]">{item.hint}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto rounded-[20px] border border-[#dce2dc] bg-white p-4 shadow-[0_8px_24px_rgba(34,54,44,.04)]">
            <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#eaf2ec] text-xs font-bold text-[#315c43]">✓</span><p className="text-xs font-semibold text-[#343b35]">Sending safely</p></div>
            <p className="mt-2 text-xs leading-5 text-[#737a74]">One set becomes one BCC message. Relay records every successful send automatically.</p>
            <p className="mt-3 flex flex-wrap gap-3 border-t border-[#ecefec] pt-3 text-[11px] text-[#8a918a]">
              <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
              <Link href="/terms" className="underline-offset-4 hover:underline">Terms</Link>
            </p>
          </div>
        </aside>

        <main className="min-w-0 px-4 pb-24 pt-6 sm:px-7 lg:px-10 lg:py-9 xl:px-12">{children}</main>
      </div>

      <nav aria-label="Mobile navigation" className="fixed inset-x-3 bottom-3 z-30 flex rounded-[20px] border border-[#d7ded8] bg-white/95 p-1.5 shadow-[0_16px_40px_rgba(30,45,36,.16)] backdrop-blur md:hidden">
        {navItems.map((item) => {
          if (item.view === 'admin' && overview.user.role !== 'ORGANIZER') return null;
          return (
            <Link
              key={item.view}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 rounded-[14px] py-2 text-[10px] transition ${
                activeView === item.view ? 'bg-[#e7eee9] font-semibold text-[#203b2f]' : 'text-[#777f78]'
              }`}
            >
              <span className={`grid h-5 w-5 place-items-center rounded-md text-[9px] font-bold ${activeView === item.view ? 'bg-[#203b2f] text-white' : 'bg-[#edf0ed]'}`} aria-hidden="true">{item.marker}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
