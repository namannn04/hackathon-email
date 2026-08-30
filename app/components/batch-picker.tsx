'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BatchPreview, Overview } from './types';

export function BatchPicker({ overview, onPreview, onSend, onAddMockAccount }: {
  overview: Overview;
  onPreview: (batchId: string) => Promise<BatchPreview>;
  onSend: (batchId: string, gmailAccountId: string) => Promise<void>;
  onAddMockAccount: () => Promise<void>;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [gmailAccountId, setGmailAccountId] = useState(overview.gmailAccounts[0]?.id ?? '');
  const [working, setWorking] = useState(false);

  if (!overview.event) return <EmptyEvent isOrganizer={overview.user.role === 'ORGANIZER'} />;
  const task = overview.mailTask;
  const progress = task?.totalBatches ? Math.round((task.sentBatches / task.totalBatches) * 100) : 0;

  async function openPreview() {
    if (!selectedId) return;
    setWorking(true);
    try { setPreview(await onPreview(selectedId)); } catch { /* Parent displays the API error. */ } finally { setWorking(false); }
  }

  async function send() {
    if (!preview || !gmailAccountId) return;
    setWorking(true);
    try {
      await onSend(preview.batchId, gmailAccountId);
      setPreview(null);
      setSelectedId(null);
    } catch { /* Parent displays the API error. */ } finally { setWorking(false); }
  }

  return (
    <>
      <div className="mb-7">
        <p className="mb-3 text-xs text-[#77776f]">Event sending desk</p>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-[30px]">Select one set, preview one email, then send</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#686861]">Nothing is reserved. Relay sends exactly one Gmail message: the admin-fixed To, subject and body, with every address in this set placed in BCC.</p>
      </div>

      <section className="mb-6 grid gap-3 rounded-[20px] border border-[#dcdcd5] bg-white p-5 md:grid-cols-2">
        <label className="text-xs font-medium text-[#676760]">Event
          <select value={overview.event.id} onChange={(e) => router.push(`/dashboard?eventId=${encodeURIComponent(e.target.value)}`)} className="field-input mt-2">
            {overview.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-[#676760]">Mail task
          <select value={task?.id ?? ''} onChange={(e) => router.push(`/dashboard?eventId=${encodeURIComponent(overview.event!.id)}&mailTaskId=${encodeURIComponent(e.target.value)}`)} className="field-input mt-2" disabled={!overview.event.mailTasks.length}>
            {!overview.event.mailTasks.length ? <option value="">No mail task yet</option> : null}
            {overview.event.mailTasks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </section>

      {!task ? (
        <div className="rounded-[20px] border border-[#deded8] bg-white p-10 text-center"><h2 className="text-lg font-semibold">No mail task in this event</h2><p className="mt-2 text-sm text-[#77776f]">The organizer needs to create the first mail task.</p>{overview.user.role === 'ORGANIZER' ? <Link href="/admin" className="mt-5 inline-flex rounded-xl bg-[#263d32] px-4 py-2.5 text-sm font-semibold text-white">Open admin portal</Link> : null}</div>
      ) : (
        <>
          <section className="mb-6 grid gap-3 sm:grid-cols-3">
            <Metric label="Available sets" value={String(overview.availableBatches.length)} note="Select only one at a time" />
            <Metric label="Mail progress" value={`${progress}%`} note={`${task.sentBatches} of ${task.totalBatches} sets sent`} />
            <Metric label="Fixed To" value={task.toEmail} note={task.subject} compact />
          </section>

          <section className="overflow-hidden rounded-[20px] border border-[#dcdcd5] bg-white">
            <div className="border-b border-[#e6e6e0] px-5 py-4"><h2 className="text-[15px] font-semibold">Available sets</h2><p className="mt-1 text-xs text-[#74746d]">One card can be selected. Selection does not lock the set.</p></div>
            {overview.availableBatches.length ? <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {overview.availableBatches.map((batch) => {
                const selected = selectedId === batch.id;
                return <button key={batch.id} onClick={() => { setSelectedId(batch.id); setPreview(null); }} aria-pressed={selected} className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-[#71877a] bg-[#f0f5f1] shadow-[inset_0_0_0_1px_#71877a]' : 'border-[#e1e1db] hover:bg-[#fafaf8]'}`}>
                  <div className="flex items-center justify-between"><span className="text-xs uppercase tracking-[.08em] text-[#74746d]">Set</span><span className={`grid h-5 w-5 place-items-center rounded-full border text-[10px] ${selected ? 'border-[#263d32] bg-[#263d32] text-white' : 'border-[#cfcfc8] text-transparent'}`}>✓</span></div>
                  <p className="mt-3 text-2xl font-semibold">#{batch.number}</p><p className="mt-4 text-xs text-[#707069]">{batch.recipientCount} BCC recipients · {batch.status === 'FAILED' ? 'retry available' : 'ready'}</p>
                </button>;
              })}
            </div> : <div className="p-12 text-center"><p className="font-medium">All sets are complete</p><p className="mt-2 text-sm text-[#77776f]">Successful sends are recorded automatically in the admin activity board.</p></div>}
            <div className="flex justify-end border-t border-[#e6e6e0] bg-[#fafaf8] p-4"><button onClick={() => void openPreview()} disabled={!selectedId || working} className="h-11 rounded-xl bg-[#263d32] px-5 text-sm font-semibold text-white disabled:opacity-45">{working ? 'Opening…' : 'Preview selected set →'}</button></div>
          </section>
        </>
      )}

      {preview ? <section className="mt-6 rounded-[22px] border border-[#bfcfc4] bg-white p-5 shadow-[0_16px_50px_rgba(34,54,44,.08)] sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-[#4e755e]">One-message preview</p><h2 className="mt-1 text-xl font-semibold">{preview.eventName} · {preview.mailTaskName} · Set #{preview.batchNumber}</h2></div><button onClick={() => setPreview(null)} className="text-sm text-[#77776f]">Close</button></div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="space-y-3">
            <PreviewField label="To" value={preview.to} />
            <PreviewField label="Subject" value={preview.subject} />
            <label className="block text-xs font-medium text-[#66665f]">Send from
              <select value={gmailAccountId} onChange={(e) => setGmailAccountId(e.target.value)} className="field-input mt-2">
                <option value="">Choose Gmail</option>{overview.gmailAccounts.map((account) => <option key={account.id} value={account.id}>{account.email}</option>)}
              </select>
            </label>
            {overview.mockTransport ? <button onClick={() => void onAddMockAccount()} className="w-full rounded-xl border border-[#d6d6cf] px-3 py-2 text-xs font-medium">Add test Gmail</button> : <a href={`/api/gmail/connect?returnTo=${encodeURIComponent(`/dashboard?eventId=${preview.eventId}&mailTaskId=${preview.mailTaskId}`)}`} className="block rounded-xl border border-[#d6d6cf] px-3 py-2 text-center text-xs font-medium">Connect another Gmail</a>}
          </div>
          <div className="space-y-4">
            <div><p className="mb-2 text-xs font-medium text-[#66665f]">BCC · {preview.bcc.length} addresses</p><div className="max-h-40 overflow-auto rounded-xl border border-[#e0e0da] bg-[#fafaf8] p-3 font-mono text-[11px] leading-5 text-[#686861]">{preview.bcc.join(', ')}</div></div>
            <div><p className="mb-2 text-xs font-medium text-[#66665f]">Body</p><div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-[#e0e0da] p-4 text-sm leading-6">{preview.bodyText}</div></div>
          </div>
        </div>
        <div className="mt-6 flex flex-col items-end gap-2 border-t border-[#ecece7] pt-5"><p className="text-xs text-[#77776f]">This sends one Gmail message, not {preview.bcc.length} separate messages.</p><button onClick={() => void send()} disabled={!gmailAccountId || working} className="h-11 rounded-xl bg-[#263d32] px-5 text-sm font-semibold text-white disabled:opacity-45">{working ? 'Sending one message…' : `Send 1 message to ${preview.bcc.length} BCC recipients`}</button></div>
      </section> : null}
    </>
  );
}

function Metric({ label, value, note, compact }: { label: string; value: string; note: string; compact?: boolean }) {
  return <div className="min-w-0 rounded-2xl border border-[#deded8] bg-white p-4"><p className="text-xs text-[#77776f]">{label}</p><p className={`mt-2 truncate font-semibold ${compact ? 'text-sm' : 'text-xl'}`}>{value}</p><p className="mt-1 truncate text-xs text-[#8a8a83]">{note}</p></div>;
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#85857e]">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>;
}

function EmptyEvent({ isOrganizer }: { isOrganizer: boolean }) {
  return <div className="mx-auto mt-16 max-w-xl rounded-3xl border border-[#deded8] bg-white p-10 text-center"><h1 className="text-2xl font-semibold">No event access yet</h1><p className="mt-2 text-sm leading-6 text-[#6e6e67]">{isOrganizer ? 'Create an event and import its participant list in the admin portal.' : 'Open the event-only invitation shared by your organizer.'}</p>{isOrganizer ? <Link href="/admin" className="mt-5 inline-flex rounded-xl bg-[#263d32] px-4 py-2.5 text-sm font-semibold text-white">Create event</Link> : null}</div>;
}
