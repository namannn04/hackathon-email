'use client';

import type { AppView, Overview } from './types';
import Link from 'next/link';
import { SignOutButton } from './sign-out-button';

const navItems: Array<{ view: AppView; href: string; icon: string; label: string }> = [
  { view: 'campaign', href: '/', icon: '✦', label: 'Events' },
  { view: 'batches', href: '/my-batches', icon: '▦', label: 'Gmail & history' },
  { view: 'admin', href: '/admin', icon: '⌁', label: 'Admin portal' },
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
    <div className="min-h-screen bg-[#f7f7f5] text-[#20201d]">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#deded8] bg-[#f7f7f5]/95 px-5 backdrop-blur md:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Relay home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#263d32] text-sm font-bold text-white">R</span>
          <div>
            <p className="text-[15px] font-semibold leading-none">Relay</p>
            <p className="mt-1 text-[11px] text-[#73736c]">Hackathon outreach</p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-[#deded8] bg-white px-3 py-1.5 text-xs text-[#5f5f58] sm:flex">
            <span className="h-2 w-2 rounded-full bg-[#3f8b62]" />
            {overview.mockTransport ? 'Safe test mode' : 'Gmail sending enabled'}
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e7e2d7] text-xs font-semibold text-[#5a4a35]" title={overview.user.email}>
            {initials || 'U'}
          </div>
          <SignOutButton className="text-[11px] font-medium text-[#686861] underline-offset-4 hover:underline sm:text-xs" />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] md:grid-cols-[230px_1fr]">
        <aside className="hidden min-h-[calc(100vh-64px)] border-r border-[#deded8] px-4 py-6 md:flex md:flex-col">
          <nav aria-label="Primary navigation" className="space-y-1">
            {navItems.map((item) => {
              if (item.view === 'admin' && overview.user.role !== 'ORGANIZER') return null;
              return (
                <Link
                  key={item.view}
                  href={item.href}
                  aria-current={activeView === item.view ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    activeView === item.view
                      ? 'bg-[#e5ebe7] font-medium text-[#263d32]'
                      : 'text-[#64645d] hover:bg-white'
                  }`}
                >
                  <span aria-hidden="true" className="w-5 text-center text-base">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto rounded-2xl border border-[#deded8] bg-white p-4">
            <p className="text-xs font-semibold text-[#34342f]">Sending safely</p>
            <p className="mt-1.5 text-xs leading-5 text-[#77776f]">
              One set becomes one BCC message, and every successful send is recorded automatically.
            </p>
            <SignOutButton className="mt-3 inline-flex text-xs font-medium text-[#686861] underline underline-offset-4" />
            <p className="mt-3 flex flex-wrap gap-3 border-t border-[#ecece6] pt-3 text-[11px] text-[#8a8a82]">
              <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
              <Link href="/terms" className="underline-offset-4 hover:underline">Terms</Link>
            </p>
          </div>
        </aside>

        <main className="min-w-0 px-5 pb-24 pt-7 sm:px-7 lg:px-10 lg:py-9">{children}</main>
      </div>

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[#deded8] bg-[#f7f7f5]/95 px-2 py-2 backdrop-blur md:hidden">
        {navItems.map((item) => {
          if (item.view === 'admin' && overview.user.role !== 'ORGANIZER') return null;
          return (
            <Link
              key={item.view}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] ${
                activeView === item.view ? 'font-semibold text-[#263d32]' : 'text-[#77776f]'
              }`}
            >
              <span className="text-base" aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
