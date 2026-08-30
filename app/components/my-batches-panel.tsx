'use client';

import type { Overview } from './types';

export function MyBatchesPanel({ overview, onAddMockAccount, onDisconnectAccount }: {
  overview: Overview;
  onAddMockAccount: () => Promise<void>;
  onDisconnectAccount: (id: string) => Promise<void>;
}) {
  return (
    <>
      <div className="mb-8"><p className="mb-3 text-xs text-[#77776f]">Your sending profile</p><h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-[30px]">Gmail accounts and sent history</h1><p className="mt-2 text-sm leading-6 text-[#686861]">Connect multiple Gmail accounts, then choose one while previewing a set. Relay never reserves sets to your account.</p></div>
      <section className="mb-6 rounded-[20px] border border-[#dcdcd5] bg-white p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-[15px] font-semibold">Connected Gmail accounts</h2><p className="mt-1 text-xs text-[#77776f]">You can connect and use three or more sender accounts, one at a time.</p></div>{overview.mockTransport ? <button onClick={() => void onAddMockAccount()} className="h-10 rounded-xl bg-[#263d32] px-4 text-sm font-semibold text-white">Add test Gmail</button> : <a href="/api/gmail/connect?returnTo=%2Fmy-batches" className="inline-flex h-10 items-center rounded-xl bg-[#263d32] px-4 text-sm font-semibold text-white">Connect Gmail</a>}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{overview.gmailAccounts.length ? overview.gmailAccounts.map((account) => <div key={account.id} className="rounded-2xl border border-[#e1e1db] bg-[#fafaf8] p-4"><p className="truncate text-sm font-semibold">{account.email}</p><p className="mt-1 text-xs text-[#77776f]">{account.displayName ?? 'Google account'} · connected</p><button type="button" onClick={() => { if (window.confirm(`Disconnect ${account.email}? Relay will no longer be able to send from it.`)) void onDisconnectAccount(account.id); }} className="mt-3 text-xs font-medium text-[#98523b] underline underline-offset-4">Disconnect</button></div>) : <p className="text-sm text-[#77776f]">No Gmail account connected yet.</p>}</div>
      </section>
      <section className="overflow-hidden rounded-[20px] border border-[#dcdcd5] bg-white">
        <div className="border-b border-[#e6e6e0] px-5 py-4"><h2 className="text-[15px] font-semibold">Automatically recorded sends</h2><p className="mt-1 text-xs text-[#77776f]">A row appears only after Gmail successfully accepts the one-message BCC send.</p></div>
        <div className="divide-y divide-[#ecece7]">{overview.sentHistory.length ? overview.sentHistory.map((item) => <div key={item.id} className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-medium">{item.eventName} · {item.mailTaskName} · Set #{item.number}</p><p className="mt-1 text-xs text-[#77776f]">{item.sentCount} BCC recipients · from {item.gmailEmail ?? 'connected Gmail'}</p></div><time className="text-xs text-[#85857e]">{new Date(item.sentAt).toLocaleString()}</time></div>) : <p className="p-8 text-center text-sm text-[#77776f]">No successful sends yet.</p>}</div>
      </section>
    </>
  );
}
