'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Overview } from './types';

export function BatchPicker({
  overview,
  onClaim,
}: {
  overview: Overview;
  onClaim: (batchIds: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [claiming, setClaiming] = useState(false);
  const router = useRouter();
  const campaign = overview.campaign;

  const batches = useMemo(() => {
    const query = search.trim().replace(/^#/, '');
    return overview.availableBatches.filter((batch) => !query || String(batch.number).includes(query));
  }, [overview.availableBatches, search]);

  if (!campaign) {
    return (
      <EmptyCampaign isOrganizer={overview.user.role === 'ORGANIZER'} />
    );
  }

  const totalSelected = overview.availableBatches
    .filter((batch) => selected.includes(batch.id))
    .reduce((total, batch) => total + batch.recipientCount, 0);
  const progress = campaign.totalRecipients
    ? Math.round((campaign.sentRecipients / campaign.totalRecipients) * 100)
    : 0;

  function toggle(batchId: string) {
    setSelected((current) => {
      if (current.includes(batchId)) return current.filter((id) => id !== batchId);
      if (current.length >= 3) return current;
      return [...current, batchId];
    });
  }

  async function claim() {
    if (!selected.length || claiming) return;
    setClaiming(true);
    try {
      await onClaim(selected);
      setSelected([]);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#77776f]">
            <span>Events</span><span>/</span>
            {overview.campaigns.length > 1 ? (
              <select
                value={campaign.id}
                onChange={(event) => { router.push(`/?campaignId=${encodeURIComponent(event.target.value)}`); }}
                className="rounded-lg border border-[#deded8] bg-white px-2 py-1 text-[#34342f] outline-none"
                aria-label="Choose event"
              >
                {overview.campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            ) : <span className="text-[#34342f]">{campaign.name}</span>}
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-[30px]">Pick your next 3 batches</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#686861]">
            Select available batches, claim them together, then connect one Gmail account to each.
          </p>
        </div>
        <div className="rounded-xl border border-[#deded8] bg-white px-4 py-2.5 text-sm">
          <span className="text-[#77776f]">Subject: </span>
          <span className="font-medium text-[#34342f]">{campaign.subject}</span>
        </div>
      </div>

      <section aria-label="Event status" className="mb-8 grid gap-3 sm:grid-cols-3">
        <Metric label="Available" value={`${campaign.availableBatches} batches`} note={`${formatNumber(campaign.totalRecipients - campaign.sentRecipients)} recipients left`} tone="green" />
        <Metric label="Your workload" value={`${overview.myBatches.filter((batch) => batch.status !== 'SENT').length} claimed`} note="Up to 3 active at a time" />
        <Metric label="Event sent" value={`${progress}%`} note={`${formatNumber(campaign.sentRecipients)} of ${formatNumber(campaign.totalRecipients)}`} progress={progress} />
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[#dcdcd5] bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-[#e6e6e0] px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="text-[15px] font-semibold">Available batches</h2>
            <p className="mt-1 text-xs text-[#74746d]">Live availability · {selected.length} selected</p>
          </div>
          <label className="relative block sm:w-56">
            <span className="sr-only">Search batches</span>
            <span aria-hidden="true" className="absolute left-3 top-2.5 text-sm text-[#94948d]">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-full rounded-xl border border-[#deded8] bg-[#fafaf8] pl-9 pr-3 text-sm outline-none placeholder:text-[#9b9b94] focus:border-[#748c7e]"
              placeholder="Find a batch"
            />
          </label>
        </div>

        {batches.length ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
            {batches.map((batch) => {
              const isSelected = selected.includes(batch.id);
              return (
                <button
                  key={batch.id}
                  onClick={() => toggle(batch.id)}
                  aria-pressed={isSelected}
                  className={`flex min-h-32 flex-col rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? 'border-[#71877a] bg-[#f0f5f1] shadow-[inset_0_0_0_1px_#71877a]'
                      : 'border-[#e1e1db] bg-white hover:border-[#bdbdb5] hover:bg-[#fafaf8]'
                  }`}
                >
                  <div className="flex w-full items-start justify-between">
                    <span className="text-xs font-medium uppercase tracking-[0.08em] text-[#74746d]">Batch</span>
                    <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-md border text-[11px] ${isSelected ? 'border-[#263d32] bg-[#263d32] text-white' : 'border-[#cfcfc8] text-transparent'}`}>✓</span>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">#{batch.number}</p>
                  <div className="mt-auto flex items-center justify-between pt-4 text-xs text-[#707069]">
                    <span>{batch.recipientCount} recipients</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#3f8b62]" />Available</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="font-medium">No available batches found</p>
            <p className="mt-2 text-sm text-[#77776f]">They may all be claimed, or your search can be cleared.</p>
          </div>
        )}

        <div className="flex flex-col items-stretch justify-between gap-3 border-t border-[#e6e6e0] bg-[#fafaf8] px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <p className="text-sm text-[#686861]">
            <span className="font-semibold text-[#2c2c28]">{selected.length} {selected.length === 1 ? 'batch' : 'batches'}</span> · {formatNumber(totalSelected)} recipients selected
          </p>
          <button
            onClick={claim}
            disabled={!selected.length || claiming}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#263d32] px-5 text-sm font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.12)] transition hover:bg-[#1d3027] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {claiming ? 'Claiming safely…' : `Claim ${selected.length || ''} ${selected.length === 1 ? 'batch' : 'batches'}`}
            {!claiming ? <span aria-hidden="true">→</span> : null}
          </button>
        </div>
      </section>
    </>
  );
}

function Metric({ label, value, note, tone, progress }: { label: string; value: string; note: string; tone?: 'green'; progress?: number }) {
  return (
    <div className="rounded-2xl border border-[#deded8] bg-white p-4 sm:p-5">
      <p className="text-xs font-medium text-[#77776f]">{label}</p>
      <p className={`mt-2 text-xl font-semibold tracking-[-0.02em] ${tone === 'green' ? 'text-[#2f6949]' : ''}`}>{value}</p>
      <p className="mt-1 text-xs text-[#8a8a83]">{note}</p>
      {progress !== undefined ? <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e8e8e2]"><div className="h-full rounded-full bg-[#3f7956] transition-all" style={{ width: `${Math.min(100, progress)}%` }} /></div> : null}
    </div>
  );
}

function EmptyCampaign({ isOrganizer }: { isOrganizer: boolean }) {
  return (
    <div className="mx-auto mt-16 max-w-xl rounded-[24px] border border-[#deded8] bg-white p-8 text-center sm:p-12">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#e5ebe7] text-xl text-[#263d32]">✦</span>
      <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">No event access yet</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6e6e67]">
        {isOrganizer ? 'Create the first event and import its recipient list to generate claimable batches.' : 'Open the event link your organizer shared with you. It grants access to that event only.'}
      </p>
      {isOrganizer ? <Link href="/admin" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#263d32] px-5 text-sm font-semibold text-white">Create event</Link> : null}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}
