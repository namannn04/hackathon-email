'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MailBodyComposer, type TestSendResult } from './mail-body-composer';
import type { MailTaskSummary, Overview } from './types';

type EventResult = { eventId: string; accepted: number; invalid: number; duplicates: number };

export function AdminPanel({ overview, onCreateEvent, onDeleteEvent, onCreateMailTask, onSendTestMail, onDeleteMailTask, onAddSuppression, onRemoveSuppression, onCreateInvite, onRevokeInvite }: {
  overview: Overview;
  onCreateEvent: (form: FormData) => Promise<EventResult>;
  onDeleteEvent: (eventId: string) => Promise<{ eventId: string; eventName: string }>;
  onCreateMailTask: (form: FormData) => Promise<unknown>;
  onSendTestMail: (form: FormData) => Promise<TestSendResult>;
  onDeleteMailTask: (mailTaskId: string) => Promise<{ mailTaskName: string; sentBatches: number }>;
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteWorking, setDeleteWorking] = useState(false);
  const [inviteWorking, setInviteWorking] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  // Remounting the composer is how its body, HTML and image state gets cleared
  // after a successful submit, since form.reset() only clears DOM inputs.
  const [composerKey, setComposerKey] = useState(0);
  const [taskToDelete, setTaskToDelete] = useState<MailTaskSummary | null>(null);
  const [taskDeleteWorking, setTaskDeleteWorking] = useState(false);
  const router = useRouter();
  const event = overview.event;
  const activities = useMemo(
    () => overview.activities.filter((item) => activityTask === 'all' || item.mailTaskId === activityTask),
    [overview.activities, activityTask],
  );
  const allTasks = overview.events.flatMap((item) => item.mailTasks);
  const totalParticipants = overview.events.reduce((sum, item) => sum + item.recipientCount, 0);
  const successfulSets = allTasks.reduce((sum, task) => sum + task.sentBatches, 0);

  if (overview.user.role !== 'ORGANIZER') {
    return <div className="rounded-[24px] border border-[#dce2dc] bg-white p-8 shadow-sm">Organizer access required.</div>;
  }

  async function submitEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEventWorking(true);
    setResult(null);
    try {
      const value = await onCreateEvent(new FormData(e.currentTarget));
      setResult(value);
      e.currentTarget.reset();
      router.push(`/admin?eventId=${encodeURIComponent(value.eventId)}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch { /* Parent displays the API error. */ } finally {
      setEventWorking(false);
    }
  }

  async function submitTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!event) return;
    setTaskWorking(true);
    const form = new FormData(e.currentTarget);
    form.set('eventId', event.id);
    try {
      await onCreateMailTask(form);
      e.currentTarget.reset();
      setSubject('');
      setComposerKey((key) => key + 1);
    } catch { /* Parent displays the API error. */ } finally {
      setTaskWorking(false);
    }
  }

  async function deleteSelectedTask() {
    if (!taskToDelete) return;
    setTaskDeleteWorking(true);
    try {
      await onDeleteMailTask(taskToDelete.id);
      // Drop the deleted task from the URL so the page does not reopen it.
      if (overview.mailTask?.id === taskToDelete.id && event) {
        router.replace(`/admin?eventId=${encodeURIComponent(event.id)}`);
      }
      setTaskToDelete(null);
    } catch { /* Parent displays the API error. */ } finally {
      setTaskDeleteWorking(false);
    }
  }

  async function createInvite() {
    if (!event) return;
    setInviteWorking(true);
    try {
      const invite = await onCreateInvite(event.id);
      setInviteUrl(invite.url);
      await navigator.clipboard?.writeText(invite.url).catch(() => undefined);
    } catch { /* Parent displays the API error. */ } finally {
      setInviteWorking(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!window.confirm('Revoke this volunteer link? Anyone who has not joined yet will no longer be able to use it.')) return;
    setRevokingInviteId(inviteId);
    try {
      await onRevokeInvite(inviteId);
    } catch { /* Parent displays the API error. */ } finally {
      setRevokingInviteId(null);
    }
  }

  function openNewEventForm() {
    document.getElementById('create-event')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => document.querySelector<HTMLInputElement>('#create-event input[name="name"]')?.focus(), 450);
  }

  async function deleteSelectedEvent() {
    if (!event) return;
    setDeleteWorking(true);
    try {
      await onDeleteEvent(event.id);
      setDeleteOpen(false);
      setInviteUrl(null);
      router.replace('/admin');
      router.refresh();
    } catch { /* Parent displays the API error. */ } finally {
      setDeleteWorking(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1280px]">
      <header className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-[#7b837c]"><span>Workspace</span><span className="text-[#b2b8b2]">/</span><span className="text-[#365644]">Admin portal</span></div>
          <h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#1f2c24] sm:text-[34px]">Keep every event on track</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#69716a]">Manage event lists, prepare mail tasks, invite volunteers, and monitor delivery from one calm workspace.</p>
        </div>
        {event ? (
          <div className="flex items-center gap-3 rounded-2xl border border-[#dce3dd] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(35,54,44,.05)]">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e7efe9] text-xs font-bold text-[#315c43]">EV</span>
            <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#929992]">Selected event</p><p className="mt-0.5 max-w-56 truncate text-sm font-semibold text-[#29372f]">{event.name}</p></div>
          </div>
        ) : null}
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace overview">
        <Metric marker="EV" label="Events" value={String(overview.events.length)} note={`${allTasks.length} mail tasks`} />
        <Metric marker="PT" label="Participants" value={formatNumber(totalParticipants)} note="Stored by event" />
        <Metric marker="OK" label="Successful sets" value={formatNumber(successfulSets)} note="Recorded automatically" />
        <Metric marker="IN" label="Active invite links" value={String(overview.invites.length)} note="Event-only access" />
      </section>

      <section className="mb-6 overflow-hidden rounded-[24px] border border-[#dce2dc] bg-white shadow-[0_12px_34px_rgba(31,48,39,.05)]">
        <div className="grid min-h-[360px] lg:grid-cols-[320px_1fr]">
          <div className="border-b border-[#e5e9e5] bg-[#fafbfa] p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a928b]">Event navigator</p><h2 className="mt-1 text-base font-semibold text-[#29352e]">Your events</h2></div>
              <span className="rounded-full bg-[#e9eeea] px-2.5 py-1 text-[11px] font-semibold text-[#5f6c63]">{overview.events.length}</span>
            </div>
            <button type="button" onClick={openNewEventForm} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#203b2f] px-4 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(32,59,47,.14)] transition hover:bg-[#294a3a]"><span className="text-base leading-none">+</span> New event</button>
            <div className="mt-4 space-y-2">
              {overview.events.length ? overview.events.map((item) => {
                const selected = event?.id === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => router.push(`/admin?eventId=${encodeURIComponent(item.id)}`)}
                    aria-pressed={selected}
                    className={`w-full rounded-2xl border p-4 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#6d8876] ${selected ? 'border-[#b9cabd] bg-white shadow-[0_8px_20px_rgba(35,54,44,.07)]' : 'border-transparent hover:border-[#dfe5df] hover:bg-white'}`}
                  >
                    <div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold text-[#2b3930]">{item.name}</span><StatusBadge status={item.status} /></div>
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-[#7a827b]"><span>{formatNumber(item.recipientCount)} people</span><span className="h-1 w-1 rounded-full bg-[#c4c9c4]" /><span>{item.mailTasks.length} tasks</span></div>
                  </button>
                );
              }) : <EmptyState title="No events yet" body="Create your first event below to import participants and start a campaign." />}
            </div>
          </div>

          <div className="p-5 sm:p-6 lg:p-7">
            {event ? (
              <>
                <div className="flex flex-col justify-between gap-4 border-b border-[#edf0ed] pb-5 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold tracking-[-0.025em] text-[#243229]">{event.name}</h2><StatusBadge status={event.status} /></div>
                    <p className="mt-2 text-sm text-[#737b74]">{formatNumber(event.recipientCount)} participants · {event.memberCount} members · {event.mailTasks.length} mail tasks</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" disabled={inviteWorking} onClick={() => void createInvite()} className="inline-flex h-10 items-center justify-center rounded-xl bg-[#203b2f] px-4 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(32,59,47,.18)] transition hover:bg-[#294a3a] disabled:cursor-not-allowed disabled:opacity-50">{inviteWorking ? 'Creating link…' : 'Create volunteer link'}</button>
                    <button type="button" onClick={() => setDeleteOpen(true)} className="inline-flex h-10 items-center justify-center rounded-xl border border-[#ead6cf] bg-[#fffaf8] px-3.5 text-xs font-semibold text-[#9a513d] transition hover:bg-[#fff2ed]">Delete event</button>
                  </div>
                </div>

                {inviteUrl ? (
                  <div className="mt-4 rounded-2xl border border-[#cfe0d3] bg-[#f3f8f4] p-3">
                    <p className="mb-2 text-xs font-semibold text-[#376047]">Link created and copied</p>
                    <div className="flex gap-2"><input aria-label="Volunteer invitation URL" readOnly value={inviteUrl} className="field-input min-w-0 flex-1 bg-white text-xs" /><button type="button" onClick={() => void navigator.clipboard?.writeText(inviteUrl)} className="rounded-xl border border-[#cad8cd] bg-white px-3 text-xs font-semibold text-[#3c5a47]">Copy</button></div>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {event.mailTasks.length ? event.mailTasks.map((task) => {
                    const progress = task.totalBatches ? Math.round((task.sentBatches / task.totalBatches) * 100) : 0;
                    return (
                      <article key={task.id} className="rounded-2xl border border-[#e1e6e1] bg-[#fbfcfb] p-4 transition hover:border-[#cfd8d1] hover:bg-white">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-[#2b3830]">{task.name}</h3><p className="mt-1 truncate text-xs text-[#7b837c]">{task.subject}</p></div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <StatusBadge status={task.status} />
                            <button
                              type="button"
                              aria-label={`Delete mail task ${task.name}`}
                              title="Delete this mail task"
                              onClick={() => setTaskToDelete(task)}
                              className="grid h-7 w-7 place-items-center rounded-lg border border-[#e4e0dc] text-[#9a7f75] transition hover:border-[#e5c8be] hover:bg-[#fff6f3] hover:text-[#a1503a]"
                            >
                              <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M2.8 4.5h10.4M6.5 4.5V3.2h3v1.3M4.2 4.5l.6 8.3h6.4l.6-8.3M6.6 7v3.4M9.4 7v3.4" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-[11px] text-[#747d75]"><span>{task.sentBatches} of {task.totalBatches} sets</span><span className="font-semibold text-[#42614e]">{progress}%</span></div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e7ebe7]"><div className="h-full rounded-full bg-[#4a7a5c] transition-[width]" style={{ width: `${progress}%` }} /></div>
                        <p className="mt-3 truncate text-[11px] text-[#8a918b]">To {task.toEmail} · {formatNumber(task.sentRecipients)}/{formatNumber(task.totalRecipients)} recipients</p>
                      </article>
                    );
                  }) : <div className="md:col-span-2"><EmptyState title="No mail tasks yet" body="Use step 2 below to prepare this event’s first message and recipient sets." /></div>}
                </div>

                {overview.invites.some((invite) => invite.eventId === event.id) ? (
                  <div className="mt-5 border-t border-[#edf0ed] pt-4"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8c938d]">Active volunteer links</p><div className="flex flex-wrap gap-2">{overview.invites.filter((invite) => invite.eventId === event.id).map((invite) => <button type="button" key={invite.id} disabled={revokingInviteId === invite.id} onClick={() => void revokeInvite(invite.id)} className="rounded-xl border border-[#ead7d0] bg-[#fffaf8] px-3 py-2 text-xs font-medium text-[#9a5944] transition hover:bg-[#fff4ef] disabled:cursor-not-allowed disabled:opacity-50">{revokingInviteId === invite.id ? 'Revoking…' : `Revoke · expires ${new Date(invite.expiresAt).toLocaleDateString()}`}</button>)}</div></div>
                ) : null}
              </>
            ) : <div className="grid h-full min-h-72 place-items-center"><EmptyState title="Select an event" body="Choose an event on the left to see its mail tasks, progress, members, and volunteer links." /></div>}
          </div>
        </div>
      </section>

      <div className="mb-3 flex items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#899089]">Campaign setup</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-[#26342b]">Create and prepare</h2></div><p className="hidden text-xs text-[#858d86] sm:block">Complete the steps from left to right</p></div>
      <section id="create-event" className="mb-5 scroll-mt-24 rounded-[24px] border border-[#dce2dc] bg-white p-5 shadow-[0_10px_30px_rgba(31,48,39,.04)] sm:p-6">
        <SectionHeading step="01" title={overview.events.length ? 'Create another event' : 'Create event'} description="Import a new participant list. Existing events and their mail tasks stay unchanged." />
        <form onSubmit={submitEvent} className="mt-6 grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Event name"><input name="name" required maxLength={120} className="field-input" placeholder="HackNova 2026" /></Field>
          <Field label="Participant list" hint="CSV or XLSX"><input name="file" required type="file" accept=".csv,.xlsx" className="file-input" /></Field>
          <button disabled={eventWorking} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#203b2f] px-5 text-sm font-semibold text-white transition hover:bg-[#294a3a] disabled:cursor-not-allowed disabled:opacity-50">{eventWorking ? 'Importing participants…' : 'Create event'}</button>
        </form>
        {result ? <div className="mt-4 rounded-2xl border border-[#cee0d3] bg-[#f2f8f4] p-3 text-xs leading-5 text-[#315e43]">Imported <strong>{result.accepted}</strong> participants · {result.invalid} invalid · {result.duplicates} duplicates removed. <a className="font-semibold underline underline-offset-4" href={`/admin?eventId=${result.eventId}`}>Manage event</a></div> : null}
      </section>

      <section className="mb-6 rounded-[24px] border border-[#dce2dc] bg-white p-5 shadow-[0_10px_30px_rgba(31,48,39,.04)] sm:p-6">
        <SectionHeading step="02" title={event ? `Create mail task for ${event.name}` : 'Create mail task'} description={event ? 'Write the message, watch the preview, and let Relay build its recipient sets.' : 'Select or create an event before preparing its message.'} />
        <form onSubmit={submitTask} className="mt-6 space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Mail task name"><input name="name" required maxLength={120} disabled={!event} className="field-input" placeholder="Reminder — 3 days before" /></Field>
            <Field label="Fixed To address"><input name="toEmail" required type="email" disabled={!event} className="field-input" placeholder="organizer@example.com" /></Field>
            <Field label="Target set size" hint="Maximum 499"><input name="batchSize" required type="number" min={1} max={499} defaultValue={300} disabled={!event} className="field-input" /></Field>
          </div>
          <Field label="Subject"><input name="subject" required maxLength={180} disabled={!event} value={subject} onChange={(e) => setSubject(e.target.value)} className="field-input" placeholder="Your event update" /></Field>
          <MailBodyComposer
            key={composerKey}
            disabled={!event}
            subject={subject}
            userEmail={overview.user.email}
            gmailAccounts={overview.gmailAccounts}
            onSendTest={onSendTestMail}
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-[#edf0ed] pt-5">
            <button disabled={!event || taskWorking} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#203b2f] px-5 text-sm font-semibold text-white transition hover:bg-[#294a3a] disabled:cursor-not-allowed disabled:opacity-45">{taskWorking ? 'Creating recipient sets…' : 'Create mail task and sets'}</button>
            <p className="text-xs text-[#8b938c]">Volunteers see this same preview before every send.</p>
          </div>
        </form>
      </section>

      <section className="mb-6 overflow-hidden rounded-[24px] border border-[#dce2dc] bg-white shadow-[0_10px_30px_rgba(31,48,39,.04)]">
        <div className="flex flex-col justify-between gap-4 border-b border-[#e8ece8] px-5 py-5 sm:flex-row sm:items-center sm:px-6">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#899089]">Live operations</p><h2 className="mt-1 text-base font-semibold text-[#29372f]">Activity {event ? `· ${event.name}` : ''}</h2><p className="mt-1 text-xs text-[#7a827b]">Successful Gmail sends and failures are recorded here automatically.</p></div>
          <select aria-label="Filter activity by mail task" value={activityTask} onChange={(e) => setActivityTask(e.target.value)} className="field-input w-full bg-white text-xs sm:w-52"><option value="all">All mail tasks</option>{event?.mailTasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</select>
        </div>
        <div className="divide-y divide-[#edf0ed]">
          {activities.length ? activities.map((item) => (
            <div key={item.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:px-6">
              <span className={`grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold ${item.status === 'SUCCESS' ? 'bg-[#e6f2e9] text-[#34704c]' : item.status === 'FAILURE' ? 'bg-[#f9eae5] text-[#a45640]' : 'bg-[#ecefec] text-[#747c75]'}`}>{item.status === 'SUCCESS' ? 'OK' : item.status === 'FAILURE' ? '!' : '·'}</span>
              <div><p className="text-sm font-medium text-[#303b34]">{item.detail ?? item.action}</p><p className="mt-1 text-xs text-[#7b837c]">{item.actorName ?? item.actorEmail ?? 'System'}{item.mailTaskName ? ` · ${item.mailTaskName}` : ''}{item.batchNumber ? ` · Set #${item.batchNumber}` : ''}{item.emailCount ? ` · ${item.emailCount} emails` : ''}</p></div>
              <time className="text-xs text-[#8b928c] sm:text-right">{new Date(item.createdAt).toLocaleString()}</time>
            </div>
          )) : <EmptyState title="No activity yet" body="Sending results will appear here as soon as volunteers begin working through sets." />}
        </div>
      </section>

      <SuppressionSection overview={overview} onAdd={onAddSuppression} onRemove={onRemoveSuppression} />

      {taskToDelete ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15251d]/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !taskDeleteWorking) setTaskToDelete(null); }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-task-title" aria-describedby="delete-task-description" className="w-full max-w-md rounded-[24px] border border-[#eadbd5] bg-white p-6 shadow-[0_24px_80px_rgba(24,36,29,.28)] sm:p-7">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff0eb] text-sm font-bold text-[#a14f39]">!</span>
            <h2 id="delete-task-title" className="mt-5 text-xl font-semibold tracking-[-0.025em] text-[#2d332f]">Delete {taskToDelete.name}?</h2>
            <p id="delete-task-description" className="mt-2 text-sm leading-6 text-[#737a74]">
              This permanently removes the message, its {taskToDelete.totalBatches} recipient {taskToDelete.totalBatches === 1 ? 'set' : 'sets'}, their delivery records, any inline images, and this task&rsquo;s activity. The event and its participant list stay as they are.
            </p>
            {taskToDelete.sentBatches > 0 ? (
              <p role="alert" className="mt-3 rounded-xl border border-[#ead8bb] bg-[#fff9ef] p-3 text-xs leading-5 text-[#7a5419]">
                {formatNumber(taskToDelete.sentRecipients)} {taskToDelete.sentRecipients === 1 ? 'recipient has' : 'recipients have'} already received this message. Deleting it does not unsend anything — it only removes the record of it from Relay.
              </p>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-[#8b938c]">Unsubscribes are kept: anyone who opted out stays opted out.</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={taskDeleteWorking} onClick={() => setTaskToDelete(null)} className="h-10 rounded-xl border border-[#d8ded9] px-4 text-sm font-semibold text-[#58635b] disabled:opacity-50">Cancel</button>
              <button type="button" disabled={taskDeleteWorking} onClick={() => void deleteSelectedTask()} className="h-10 rounded-xl bg-[#a64f39] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(166,79,57,.2)] transition hover:bg-[#923f2c] disabled:cursor-not-allowed disabled:opacity-50">{taskDeleteWorking ? 'Deleting…' : 'Delete permanently'}</button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteOpen && event ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15251d]/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !deleteWorking) setDeleteOpen(false); }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-event-title" aria-describedby="delete-event-description" className="w-full max-w-md rounded-[24px] border border-[#eadbd5] bg-white p-6 shadow-[0_24px_80px_rgba(24,36,29,.28)] sm:p-7">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff0eb] text-sm font-bold text-[#a14f39]">!</span>
            <h2 id="delete-event-title" className="mt-5 text-xl font-semibold tracking-[-0.025em] text-[#2d332f]">Delete {event.name}?</h2>
            <p id="delete-event-description" className="mt-2 text-sm leading-6 text-[#737a74]">This permanently removes the event, participant list, mail tasks, recipient sets, activity, members, and invitation links. This action cannot be undone.</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={deleteWorking} onClick={() => setDeleteOpen(false)} className="h-10 rounded-xl border border-[#d8ded9] px-4 text-sm font-semibold text-[#58635b] disabled:opacity-50">Cancel</button>
              <button type="button" disabled={deleteWorking} onClick={() => void deleteSelectedEvent()} className="h-10 rounded-xl bg-[#a64f39] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(166,79,57,.2)] transition hover:bg-[#923f2c] disabled:cursor-not-allowed disabled:opacity-50">{deleteWorking ? 'Deleting event…' : 'Delete permanently'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SuppressionSection({ overview, onAdd, onRemove }: { overview: Overview; onAdd: (email: string, reason: string) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setAdding(true);
    try {
      await onAdd(String(form.get('email')), String(form.get('reason')));
      e.currentTarget.reset();
    } catch { /* Parent displays the API error and preserves the form. */ } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    setRemovingId(id);
    try {
      await onRemove(id);
    } catch { /* Parent displays the API error. */ } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="rounded-[24px] border border-[#dce2dc] bg-white p-5 shadow-[0_10px_30px_rgba(31,48,39,.04)] sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#899089]">Safety controls</p><h2 className="mt-1 text-base font-semibold text-[#29372f]">Suppression list</h2><p className="mt-1 text-xs leading-5 text-[#7a827b]">Excluded addresses are left out of future mail tasks.</p></div><span className="rounded-full bg-[#f0f2f0] px-2.5 py-1 text-[11px] font-semibold text-[#69716a]">{overview.suppressions.length}</span></div>
      <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-[minmax(190px,1fr)_minmax(220px,1.4fr)_auto]"><input aria-label="Email to suppress" name="email" required type="email" disabled={adding} className="field-input" placeholder="person@example.com" /><input aria-label="Suppression reason" name="reason" required disabled={adding} className="field-input" placeholder="Reason for exclusion" /><button disabled={adding} className="h-11 rounded-xl border border-[#ccd5ce] bg-[#f9faf9] px-5 text-sm font-semibold text-[#405246] transition hover:bg-[#f0f4f1] disabled:cursor-not-allowed disabled:opacity-50">{adding ? 'Adding…' : 'Add address'}</button></form>
      {overview.suppressions.length ? <div className="mt-5 divide-y divide-[#edf0ed] border-t border-[#edf0ed]">{overview.suppressions.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3.5"><div className="min-w-0"><p className="truncate text-sm font-medium text-[#313d35]">{item.email}</p><p className="mt-0.5 truncate text-xs text-[#7c847d]">{item.reason}</p></div><button type="button" disabled={removingId === item.id} onClick={() => void remove(item.id)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#9a5944] transition hover:bg-[#fff3ef] disabled:cursor-not-allowed disabled:opacity-50">{removingId === item.id ? 'Removing…' : 'Remove'}</button></div>)}</div> : <p className="mt-5 rounded-2xl bg-[#fafbfa] p-4 text-center text-xs text-[#858d86]">No suppressed addresses.</p>}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-[#5f6861]"><span>{label}</span>{hint ? <span className="font-normal text-[#9aa09a]">{hint}</span> : null}</span>{children}</label>;
}


function Metric({ marker, label, value, note }: { marker: string; label: string; value: string; note: string }) {
  return <div className="rounded-[20px] border border-[#dce2dc] bg-white p-4 shadow-[0_8px_24px_rgba(31,48,39,.035)]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-[#767e77]">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-[#26342b]">{value}</p><p className="mt-1 text-xs text-[#929892]">{note}</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf2ee] text-[10px] font-bold text-[#4d6857]">{marker}</span></div></div>;
}

function StatusBadge({ status }: { status: string }) {
  const positive = status === 'ACTIVE' || status === 'READY' || status === 'SUCCESS';
  return <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${positive ? 'bg-[#e6f1e8] text-[#3b6b4b]' : 'bg-[#eef0ee] text-[#717871]'}`}>{status.toLowerCase()}</span>;
}

function SectionHeading({ step, title, description }: { step: string; title: string; description: string }) {
  return <div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#203b2f] text-[11px] font-bold text-white">{step}</span><div><h2 className="text-base font-semibold text-[#29372f]">{title}</h2><p className="mt-1 text-xs leading-5 text-[#7b837c]">{description}</p></div></div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="p-6 text-center"><span className="mx-auto grid h-10 w-10 place-items-center rounded-2xl bg-[#edf2ee] text-sm font-bold text-[#577060]">R</span><p className="mt-3 text-sm font-semibold text-[#46534b]">{title}</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#858c86]">{body}</p></div>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}
