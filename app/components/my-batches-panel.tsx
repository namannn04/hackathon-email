'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ClaimedBatch, Overview } from './types';

export function MyBatchesPanel({
  overview,
  onAssign,
  onAddMockAccount,
  onSend,
}: {
  overview: Overview;
  onAssign: (batchId: string, gmailAccountId: string) => Promise<void>;
  onAddMockAccount: () => Promise<void>;
  onSend: (batchIds: string[]) => Promise<void>;
}) {
  const [workingBatch, setWorkingBatch] = useState<string | null>(null);
  const [addingAccount, setAddingAccount] = useState(false);
  const [sending, setSending] = useState<string[]>([]);
  const activeBatches = overview.myBatches.filter((batch) => batch.status !== 'SENT');
  const completedBatches = overview.myBatches.filter((batch) => batch.status === 'SENT');
  const readyIds = activeBatches
    .filter((batch) => batch.gmailAccountId && ['CLAIMED', 'FAILED'].includes(batch.status))
    .map((batch) => batch.id);

  async function assign(batchId: string, gmailAccountId: string) {
    if (!gmailAccountId) return;
    setWorkingBatch(batchId);
    try {
      await onAssign(batchId, gmailAccountId);
    } finally {
      setWorkingBatch(null);
    }
  }

  async function addMock() {
    setAddingAccount(true);
    try {
      await onAddMockAccount();
    } finally {
      setAddingAccount(false);
    }
  }

  async function send(batchIds: string[]) {
    setSending(batchIds);
    try {
      await onSend(batchIds);
    } finally {
      setSending([]);
    }
  }

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="mb-3 text-xs text-[#77776f]">Volunteer workspace</p>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-[30px]">Your claimed batches</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#686861]">
            Give each batch its own Gmail account, then send all ready batches in one go.
          </p>
        </div>
        <button
          onClick={() => send(readyIds)}
          disabled={!readyIds.length || sending.length > 0}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#263d32] px-5 text-sm font-semibold text-white transition hover:bg-[#1d3027] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {sending.length ? `Sending ${sending.length} ${sending.length === 1 ? 'batch' : 'batches'}…` : `Send ${readyIds.length || ''} ready ${readyIds.length === 1 ? 'batch' : 'batches'}`}
          {!sending.length ? <span aria-hidden="true">→</span> : null}
        </button>
      </div>

      <section className="mb-6 rounded-[20px] border border-[#dcdcd5] bg-white p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-[15px] font-semibold">Gmail accounts</h2>
            <p className="mt-1 text-xs text-[#74746d]">Only you can view or assign your connections.</p>
          </div>
          {overview.mockTransport ? (
            <button onClick={addMock} disabled={addingAccount} className="h-10 rounded-xl border border-[#d6d6cf] bg-[#fafaf8] px-4 text-sm font-medium disabled:opacity-50">
              {addingAccount ? 'Adding…' : 'Add test Gmail account'}
            </button>
          ) : (
            <a href="/api/gmail/connect?returnTo=%2Fmy-batches" className="inline-flex h-10 items-center justify-center rounded-xl border border-[#d6d6cf] bg-[#fafaf8] px-4 text-sm font-medium">
              Connect Gmail account
            </a>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {overview.gmailAccounts.length ? overview.gmailAccounts.map((account) => (
            <span key={account.id} className="inline-flex items-center gap-2 rounded-full border border-[#dfe5e1] bg-[#f2f6f3] px-3 py-1.5 text-xs text-[#345543]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3f8b62]" />{account.email}
            </span>
          )) : <p className="text-sm text-[#77776f]">No Gmail accounts connected yet.</p>}
        </div>
      </section>

      {activeBatches.length ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {activeBatches.map((batch) => (
            <BatchWorkCard
              key={batch.id}
              batch={batch}
              accounts={overview.gmailAccounts}
              allBatches={activeBatches}
              assigning={workingBatch === batch.id}
              sending={sending.includes(batch.id) || batch.status === 'SENDING'}
              onAssign={assign}
              onSend={() => send([batch.id])}
            />
          ))}
        </section>
      ) : (
        <div className="rounded-[22px] border border-dashed border-[#cfcfc7] bg-white px-6 py-14 text-center">
          <p className="font-medium">You have no active batches</p>
          <p className="mt-2 text-sm text-[#77776f]">Claim up to three available batches to begin.</p>
          <Link href="/" className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#263d32] px-4 text-sm font-semibold text-white">Choose batches</Link>
        </div>
      )}

      {completedBatches.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-[#55554f]">Completed this campaign</h2>
          <div className="space-y-2">
            {completedBatches.slice(0, 8).map((batch) => (
              <div key={batch.id} className="flex items-center justify-between rounded-xl border border-[#deded8] bg-white px-4 py-3 text-sm">
                <span><span className="mr-2 text-[#397452]">✓</span>{batch.campaignName} · Batch #{batch.number}</span>
                <span className="text-xs text-[#77776f]">{batch.sentCount}/{batch.recipientCount} sent</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function BatchWorkCard({
  batch,
  accounts,
  allBatches,
  assigning,
  sending,
  onAssign,
  onSend,
}: {
  batch: ClaimedBatch;
  accounts: Overview['gmailAccounts'];
  allBatches: ClaimedBatch[];
  assigning: boolean;
  sending: boolean;
  onAssign: (batchId: string, accountId: string) => Promise<void>;
  onSend: () => void;
}) {
  const progress = batch.recipientCount ? Math.round((batch.sentCount / batch.recipientCount) * 100) : 0;
  const usedByOther = new Set(
    allBatches.filter((item) => item.id !== batch.id && item.gmailAccountId).map((item) => item.gmailAccountId),
  );
  return (
    <article className="rounded-[20px] border border-[#dcdcd5] bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-[#77776f]">{batch.campaignName}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em]">Batch #{batch.number}</h2>
        </div>
        <StatusPill status={batch.status} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex justify-between text-xs text-[#77776f]"><span>Sending progress</span><span>{batch.sentCount}/{batch.recipientCount}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-[#e8e8e2]"><div className="h-full rounded-full bg-[#3f7956] transition-all" style={{ width: `${progress}%` }} /></div>
      </div>

      {batch.lastError ? <div className="mt-4 rounded-xl border border-[#ead4cc] bg-[#fbf3f0] px-3 py-2.5 text-xs leading-5 text-[#8a4936]">{batch.lastError}</div> : null}

      <label className="mt-5 block">
        <span className="mb-2 block text-xs font-medium text-[#5f5f58]">Send with</span>
        <select
          value={batch.gmailAccountId ?? ''}
          disabled={assigning || sending}
          onChange={(event) => onAssign(batch.id, event.target.value)}
          className="h-11 w-full rounded-xl border border-[#d9d9d2] bg-[#fafaf8] px-3 text-sm outline-none focus:border-[#748c7e] disabled:opacity-60"
        >
          <option value="">Choose a Gmail account</option>
          {accounts.map((account) => <option key={account.id} value={account.id} disabled={usedByOther.has(account.id)}>{account.email}{usedByOther.has(account.id) ? ' · already assigned' : ''}</option>)}
        </select>
      </label>

      <button
        onClick={onSend}
        disabled={!batch.gmailAccountId || sending}
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#263d32] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
      >
        {sending ? 'Sending safely…' : batch.status === 'FAILED' ? 'Retry send' : 'Send this batch'}
      </button>
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  const style = status === 'FAILED' ? 'bg-[#fbefeb] text-[#98523b]' : status === 'SENDING' ? 'bg-[#eef1f7] text-[#536888]' : 'bg-[#f0f5f1] text-[#3d6c50]';
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] ${style}`}>{status.toLowerCase()}</span>;
}
