'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Overview } from './types';

type EventResult = { eventId: string; accepted: number; invalid: number; duplicates: number };

export function AdminPanel({ overview, onCreateEvent, onCreateMailTask, onAddSuppression, onRemoveSuppression, onCreateInvite, onRevokeInvite }: {
  overview: Overview;
  onCreateEvent: (form: FormData) => Promise<EventResult>;
  onCreateMailTask: (form: FormData) => Promise<unknown>;
  onAddSuppression: (email: string, reason: string) => Promise<void>;
  onRemoveSuppression: (id: string) => Promise<void>;
  onCreateInvite: (eventId: string) => Promise<{ id: string; eventId: string; eventName: string; url: string; expiresAt: string }>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
}) {
  const [eventWorking, setEventWorking] = useState(false);
  const [taskWorking, setTaskWorking] = useState(false);
  const [result, setResult] = useState<EventResult | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [activityTask, setActivityTask] = useState('all');
  const router = useRouter();
  const event = overview.event;
  const activities = useMemo(() => overview.activities.filter((item) => activityTask === 'all' || item.mailTaskId === activityTask), [overview.activities, activityTask]);

  if (overview.user.role !== 'ORGANIZER') return <div className="rounded-2xl border border-[#deded8] bg-white p-8">Organizer access required.</div>;

  async function submitEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setEventWorking(true); setResult(null);
    try { const value = await onCreateEvent(new FormData(e.currentTarget)); setResult(value); e.currentTarget.reset(); } catch { /* Parent displays the API error. */ } finally { setEventWorking(false); }
  }
  async function submitTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!event) return; setTaskWorking(true);
    const form = new FormData(e.currentTarget);
    form.set('eventId', event.id);
    try {
      await onCreateMailTask(form);
      e.currentTarget.reset();
    } catch { /* Parent displays the API error. */ } finally { setTaskWorking(false); }
  }
  async function createInvite() {
    if (!event) return;
    try {
      const invite = await onCreateInvite(event.id);
      setInviteUrl(invite.url);
      await navigator.clipboard?.writeText(invite.url).catch(() => undefined);
    } catch { /* Parent displays the API error. */ }
  }

  return (
    <>
      <div className="mb-8"><p className="mb-3 text-xs text-[#77776f]">Organizer workspace</p><h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-[30px]">Admin portal</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#686861]">Manage participant lists by event, create multiple mail tasks inside each event, and see every successful or failed set automatically.</p></div>

      <section className="mb-6 grid gap-3 sm:grid-cols-3"><Metric label="Events" value={String(overview.events.length)} note={`${overview.events.reduce((sum, item) => sum + item.mailTasks.length, 0)} mail tasks`} /><Metric label="Participants" value={formatNumber(overview.events.reduce((sum, item) => sum + item.recipientCount, 0))} note="Stored once per event" /><Metric label="Successful sets" value={formatNumber(overview.events.flatMap((item) => item.mailTasks).reduce((sum, task) => sum + task.sentBatches, 0))} note="Recorded automatically" /></section>

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(300px,.7fr)_minmax(0,1.3fr)]">
        <section className="rounded-[20px] border border-[#dcdcd5] bg-white p-5">
          <h2 className="text-[15px] font-semibold">Events</h2><p className="mt-1 text-xs text-[#77776f]">Choose an event to manage its mail tasks and activity.</p>
          <div className="mt-4 space-y-2">{overview.events.length ? overview.events.map((item) => <button key={item.id} onClick={() => router.push(`/admin?eventId=${encodeURIComponent(item.id)}`)} className={`w-full rounded-2xl border p-4 text-left ${event?.id === item.id ? 'border-[#71877a] bg-[#f0f5f1]' : 'border-[#e1e1db] bg-[#fafaf8]'}`}><div className="flex justify-between gap-3"><span className="truncate text-sm font-semibold">{item.name}</span><span className="text-[10px] uppercase text-[#6f786f]">{item.status}</span></div><p className="mt-2 text-xs text-[#77776f]">{formatNumber(item.recipientCount)} participants · {item.mailTasks.length} mail tasks · {item.memberCount} members</p></button>) : <p className="py-4 text-sm text-[#77776f]">Create the first event below.</p>}</div>
        </section>

        <section className="rounded-[20px] border border-[#dcdcd5] bg-white p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-[15px] font-semibold">{event ? event.name : 'Select an event'}</h2><p className="mt-1 text-xs text-[#77776f]">Event-only volunteer access and mail task progress.</p></div>{event ? <button onClick={() => void createInvite()} className="h-9 rounded-xl bg-[#263d32] px-3.5 text-xs font-semibold text-white">Create event link</button> : null}</div>
          {inviteUrl ? <div className="mt-4 flex gap-2"><input readOnly value={inviteUrl} className="field-input min-w-0 flex-1 text-xs" /><button onClick={() => void navigator.clipboard?.writeText(inviteUrl)} className="rounded-xl border border-[#d6d6cf] px-3 text-xs font-medium">Copy</button></div> : null}
          {event ? <div className="mt-5 grid gap-3 md:grid-cols-2">{event.mailTasks.length ? event.mailTasks.map((task) => { const progress = task.totalBatches ? Math.round(task.sentBatches / task.totalBatches * 100) : 0; return <article key={task.id} className="rounded-2xl border border-[#e1e1db] bg-[#fafaf8] p-4"><div className="flex justify-between gap-3"><h3 className="truncate text-sm font-semibold">{task.name}</h3><span className="text-[10px] uppercase text-[#6e776e]">{task.status}</span></div><p className="mt-2 truncate text-xs text-[#77776f]">To: {task.toEmail}</p><p className="mt-1 truncate text-xs text-[#77776f]">{task.subject}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e4e4df]"><div className="h-full bg-[#3f7956]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-[#77776f]">{task.sentBatches}/{task.totalBatches} sets · {formatNumber(task.sentRecipients)}/{formatNumber(task.totalRecipients)} BCC recipients</p></article>; }) : <p className="text-sm text-[#77776f]">No mail tasks yet. Create one below.</p>}</div> : null}
          {event ? <div className="mt-5 flex flex-wrap gap-2">{overview.invites.filter((invite) => invite.eventId === event.id).map((invite) => <button key={invite.id} onClick={() => void onRevokeInvite(invite.id)} className="rounded-xl border border-[#dfcbc4] px-3 py-2 text-xs text-[#98523b]">Revoke active link · {new Date(invite.expiresAt).toLocaleDateString()}</button>)}</div> : null}
        </section>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section className="rounded-[20px] border border-[#dcdcd5] bg-white p-5 sm:p-6"><h2 className="text-[15px] font-semibold">Create event</h2><p className="mt-1 text-xs text-[#77776f]">Import participants once. Every later mail task reuses this event list.</p><form onSubmit={submitEvent} className="mt-5 space-y-4"><Field label="Event name"><input name="name" required maxLength={120} className="field-input" placeholder="HackNova 2026" /></Field><Field label="Participant CSV/XLSX"><input name="file" required type="file" accept=".csv,.xlsx" className="block h-11 w-full rounded-xl border border-[#d9d9d2] bg-[#fafaf8] text-sm file:mr-3 file:h-full file:border-0 file:border-r file:border-[#d9d9d2] file:px-3" /></Field><button disabled={eventWorking} className="h-11 rounded-xl bg-[#263d32] px-5 text-sm font-semibold text-white disabled:opacity-50">{eventWorking ? 'Importing…' : 'Create event'}</button></form>{result ? <div className="mt-4 rounded-xl bg-[#f0f6f2] p-3 text-xs text-[#315e43]">Imported {result.accepted} participants · {result.invalid} invalid · {result.duplicates} duplicates removed. <a className="font-semibold underline" href={`/admin?eventId=${result.eventId}`}>Manage event</a></div> : null}</section>

        <section className="rounded-[20px] border border-[#dcdcd5] bg-white p-5 sm:p-6"><h2 className="text-[15px] font-semibold">Create mail task {event ? `for ${event.name}` : ''}</h2><p className="mt-1 text-xs leading-5 text-[#77776f]">Each set becomes one message. Remainders under 100 merge into the previous set when Gmail’s 500-recipient limit allows.</p><form onSubmit={submitTask} className="mt-5 space-y-4"><Field label="Mail task name"><input name="name" required maxLength={120} disabled={!event} className="field-input" placeholder="Reminder — 3 days before" /></Field><Field label="Fixed To address"><input name="toEmail" required type="email" disabled={!event} className="field-input" placeholder="organizer@example.com" /></Field><Field label="Subject"><input name="subject" required maxLength={180} disabled={!event} className="field-input" /></Field><Field label="Body"><textarea name="bodyText" required rows={7} maxLength={50000} disabled={!event} className="field-input min-h-36 resize-y py-3" /></Field><Field label="HTML body (optional)"><textarea name="bodyHtml" rows={6} maxLength={200000} disabled={!event} className="field-input min-h-28 resize-y py-3 font-mono text-xs" placeholder={'<div>\n  <img src="https://your-domain/poster.png" width="600" alt="Poster">\n  <p>Hi everyone,</p>\n</div>'} /><p className="mt-1.5 text-[11px] leading-4 text-[#8a8a82]">Leave empty to send the plain body as-is. Fill it to control layout or include an image — host the image somewhere public and reference it with a full https URL. The plain body above is still sent as the text alternative.</p></Field><Field label="Inline images (optional)"><input name="images" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple disabled={!event} className="field-input h-auto py-2.5 text-xs" /><p className="mt-1.5 text-[11px] leading-4 text-[#8a8a82]">Up to 5 images, 2 MB each. They travel inside the message, so recipients see them without loading anything.</p></Field><Field label="Image placement"><select name="imagePlacement" defaultValue="above" disabled={!event} className="field-input"><option value="above">Above the text</option><option value="below">Below the text</option></select><p className="mt-1.5 text-[11px] leading-4 text-[#8a8a82]">Used when the HTML body is empty. Write an HTML body instead to place images anywhere, referencing them as <code>cid:image1</code>, <code>cid:image2</code>, in upload order.</p></Field><Field label="Target set size"><input name="batchSize" required type="number" min={1} max={499} defaultValue={300} disabled={!event} className="field-input" /></Field><button disabled={!event || taskWorking} className="h-11 rounded-xl bg-[#263d32] px-5 text-sm font-semibold text-white disabled:opacity-50">{taskWorking ? 'Creating sets…' : 'Create mail task and sets'}</button></form></section>
      </div>

      <section className="mt-6 overflow-hidden rounded-[20px] border border-[#dcdcd5] bg-white"><div className="flex flex-col justify-between gap-3 border-b border-[#e6e6e0] px-5 py-4 sm:flex-row sm:items-center"><div><h2 className="text-[15px] font-semibold">Automatic activity board {event ? `· ${event.name}` : ''}</h2><p className="mt-1 text-xs text-[#77776f]">No manual tick marks. Successful Gmail sends and failures appear here automatically.</p></div><select value={activityTask} onChange={(e) => setActivityTask(e.target.value)} className="rounded-xl border border-[#d9d9d2] bg-white px-3 py-2 text-xs"><option value="all">All mail tasks</option>{event?.mailTasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</select></div><div className="divide-y divide-[#ecece7]">{activities.length ? activities.map((item) => <div key={item.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center"><span className={`h-2.5 w-2.5 rounded-full ${item.status === 'SUCCESS' ? 'bg-[#3f8b62]' : item.status === 'FAILURE' ? 'bg-[#b85d45]' : 'bg-[#9a9a92]'}`} /><div><p className="text-sm font-medium">{item.detail ?? item.action}</p><p className="mt-1 text-xs text-[#77776f]">{item.actorName ?? item.actorEmail ?? 'System'}{item.mailTaskName ? ` · ${item.mailTaskName}` : ''}{item.batchNumber ? ` · Set #${item.batchNumber}` : ''}{item.emailCount ? ` · ${item.emailCount} emails` : ''}</p></div><time className="text-xs text-[#85857e]">{new Date(item.createdAt).toLocaleString()}</time></div>) : <p className="p-8 text-center text-sm text-[#77776f]">Activity will appear after this event is created and sets are sent.</p>}</div></section>

      <SuppressionSection overview={overview} onAdd={onAddSuppression} onRemove={onRemoveSuppression} />
    </>
  );
}

function SuppressionSection({ overview, onAdd, onRemove }: { overview: Overview; onAdd: (email: string, reason: string) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); const form = new FormData(e.currentTarget); await onAdd(String(form.get('email')), String(form.get('reason'))); e.currentTarget.reset(); }
  return <section className="mt-6 rounded-[20px] border border-[#dcdcd5] bg-white p-5"><h2 className="text-[15px] font-semibold">Suppression list</h2><form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-[220px_1fr_auto]"><input name="email" required type="email" className="field-input" placeholder="person@example.com" /><input name="reason" required className="field-input" placeholder="Reason" /><button className="rounded-xl border border-[#d6d6cf] px-4 text-sm font-medium">Add</button></form><div className="mt-4 divide-y divide-[#ecece7]">{overview.suppressions.map((item) => <div key={item.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{item.email}</p><p className="text-xs text-[#77776f]">{item.reason}</p></div><button onClick={() => void onRemove(item.id)} className="text-xs text-[#98523b]">Remove</button></div>)}</div></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-medium text-[#5f5f58]">{label}</span>{children}</label>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="rounded-2xl border border-[#deded8] bg-white p-4"><p className="text-xs text-[#77776f]">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-[#8a8a83]">{note}</p></div>; }
function formatNumber(value: number) { return new Intl.NumberFormat('en-US').format(value); }
