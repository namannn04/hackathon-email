'use client';

import { useState } from 'react';
import type { Overview } from './types';

type ImportResult = {
  campaignId: string;
  batches: number;
  accepted: number;
  sendable: number;
  invalid: number;
  duplicates: number;
  suppressed: number;
};

export function AdminPanel({
  overview,
  onCreateCampaign,
  onAddSuppression,
  onRemoveSuppression,
  onCreateInvite,
  onRevokeInvite,
}: {
  overview: Overview;
  onCreateCampaign: (form: FormData) => Promise<ImportResult>;
  onAddSuppression: (email: string, reason: string) => Promise<void>;
  onRemoveSuppression: (id: string) => Promise<void>;
  onCreateInvite: (campaignId: string) => Promise<{
    id: string;
    campaignId: string;
    campaignName: string;
    url: string;
    expiresAt: string;
  }>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [suppressionWorking, setSuppressionWorking] = useState(false);
  const [inviteWorking, setInviteWorking] = useState<string | null>(null);
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});

  if (overview.user.role !== 'ORGANIZER') {
    return <div className="rounded-2xl border border-[#deded8] bg-white p-8"><h1 className="text-xl font-semibold">Organizer access required</h1><p className="mt-2 text-sm text-[#77776f]">Your account does not have permission to manage events.</p></div>;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    setResult(null);
    try {
      const created = await onCreateCampaign(new FormData(formElement));
      setResult(created);
      formElement.reset();
    } catch {
      // RelayApp surfaces the safe server message in a global alert.
    } finally {
      setSubmitting(false);
    }
  }

  async function suppress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSuppressionWorking(true);
    const form = new FormData(formElement);
    try {
      await onAddSuppression(String(form.get('email') ?? ''), String(form.get('reason') ?? ''));
      formElement.reset();
    } catch {
      // RelayApp surfaces the safe server message in a global alert.
    } finally {
      setSuppressionWorking(false);
    }
  }

  const totalRecipients = overview.campaigns.reduce((total, campaign) => total + campaign.totalRecipients, 0);
  const totalSent = overview.campaigns.reduce((total, campaign) => total + campaign.sentRecipients, 0);

  async function createInvite(campaignId: string) {
    setInviteWorking(campaignId);
    try {
      const invite = await onCreateInvite(campaignId);
      setInviteLinks((current) => ({ ...current, [campaignId]: invite.url }));
      await navigator.clipboard?.writeText(invite.url).catch(() => undefined);
    } catch {
      // RelayApp surfaces the safe server message in a global alert.
    } finally {
      setInviteWorking(null);
    }
  }

  return (
    <>
      <div className="mb-8">
        <p className="mb-3 text-xs text-[#77776f]">Organizer workspace</p>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-[30px]">Admin portal</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#686861]">Create an event, set its exact email content, import recipients, and share an event-only volunteer link.</p>
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <AdminMetric label="Events" value={String(overview.campaigns.length)} note={`${overview.campaigns.filter((campaign) => campaign.status === 'ACTIVE').length} active`} />
        <AdminMetric label="Recipients" value={formatNumber(totalRecipients)} note="Valid and non-suppressed" />
        <AdminMetric label="Delivered" value={formatNumber(totalSent)} note={`${totalRecipients ? Math.round((totalSent / totalRecipients) * 100) : 0}% of imported recipients`} />
      </section>

      <section className="mb-6 rounded-[20px] border border-[#dcdcd5] bg-white p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-[15px] font-semibold">Events and volunteer access</h2>
          <p className="mt-1 text-xs leading-5 text-[#77776f]">Each link grants access to one event only. Volunteers cannot browse other events or recipient emails. New links are shown once, expire after 14 days, and can be revoked here.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {overview.campaigns.length ? overview.campaigns.map((campaign) => {
            const activeInvites = overview.invites.filter((invite) => invite.campaignId === campaign.id);
            const generatedLink = inviteLinks[campaign.id];
            return (
              <article key={campaign.id} className="rounded-2xl border border-[#e1e1db] bg-[#fafaf8] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{campaign.name}</h3><p className="mt-1 truncate text-xs text-[#77776f]">{campaign.subject}</p></div>
                  <span className="rounded-full bg-[#e5ebe7] px-2.5 py-1 text-[10px] font-semibold uppercase text-[#345543]">{campaign.status.toLowerCase()}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#77776f]"><span>{formatNumber(campaign.totalRecipients)} recipients</span><span>{campaign.totalBatches} batches</span><span>{campaign.memberCount} members</span></div>
                {generatedLink ? (
                  <div className="mt-4 flex gap-2"><input readOnly value={generatedLink} aria-label={`Invitation link for ${campaign.name}`} className="field-input min-w-0 flex-1 text-xs" /><button onClick={() => void navigator.clipboard?.writeText(generatedLink)} className="rounded-xl border border-[#d6d6cf] bg-white px-3 text-xs font-medium">Copy</button></div>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button onClick={() => void createInvite(campaign.id)} disabled={inviteWorking === campaign.id} className="h-9 rounded-xl bg-[#263d32] px-3.5 text-xs font-semibold text-white disabled:opacity-50">{inviteWorking === campaign.id ? 'Creating…' : 'Create event link'}</button>
                  {activeInvites.map((invite) => <button key={invite.id} onClick={() => void onRevokeInvite(invite.id)} className="h-9 rounded-xl border border-[#dfcbc4] bg-white px-3 text-xs font-medium text-[#98523b]">Revoke link · expires {new Date(invite.expiresAt).toLocaleDateString()}</button>)}
                </div>
              </article>
            );
          }) : <p className="text-sm text-[#77776f]">Create your first event below.</p>}
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
        <section className="rounded-[20px] border border-[#dcdcd5] bg-white p-5 sm:p-7">
          <div className="mb-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em]">Create event</h2>
            <p className="mt-1 text-sm text-[#77776f]">CSV and XLSX files up to 10 MB · batches capped at 500 recipients</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <Field label="Event name"><input name="name" required maxLength={120} placeholder="HackNova 2026" className="field-input" /></Field>
            <Field label="Email subject"><input name="subject" required maxLength={180} placeholder="Applications are open for HackNova 2026" className="field-input" /></Field>
            <Field label="Email content"><textarea name="bodyText" required maxLength={50000} rows={9} placeholder="Hello,&#10;&#10;We’re inviting your community…" className="field-input min-h-44 resize-y py-3" /></Field>
            <div className="grid gap-5 sm:grid-cols-[1fr_150px]">
              <Field label="Recipient file"><input name="file" required type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="block h-11 w-full rounded-xl border border-[#d9d9d2] bg-[#fafaf8] text-sm file:mr-3 file:h-full file:border-0 file:border-r file:border-[#d9d9d2] file:bg-[#f1f1ed] file:px-3 file:text-xs file:font-medium" /></Field>
              <Field label="Batch size"><input name="batchSize" required type="number" min={1} max={500} defaultValue={300} className="field-input" /></Field>
            </div>
            <button disabled={submitting} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#263d32] px-5 text-sm font-semibold text-white disabled:opacity-50">{submitting ? 'Validating and batching…' : 'Create event'}</button>
          </form>

          {result ? (
            <div className="mt-6 rounded-2xl border border-[#cfe0d5] bg-[#f0f6f2] p-4 text-sm text-[#315e43]">
              <p className="font-semibold">Event is ready with {result.batches} batches.</p>
              <p className="mt-1 text-xs leading-5">{formatNumber(result.sendable)} sendable · {result.invalid} invalid · {result.duplicates} duplicates removed · {result.suppressed} suppressed</p>
              <a href={`/?campaignId=${encodeURIComponent(result.campaignId)}`} className="mt-3 inline-flex font-semibold underline underline-offset-4">Open event →</a>
            </div>
          ) : null}
        </section>

        <section className="rounded-[20px] border border-[#dcdcd5] bg-white p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="text-[15px] font-semibold">Recent activity</h2><p className="mt-1 text-xs text-[#77776f]">Security and delivery audit trail</p></div><span className="rounded-full bg-[#f1f1ed] px-2.5 py-1 text-[10px] font-medium text-[#66665f]">Last 20</span></div>
          <div className="space-y-4">
            {overview.audits.length ? overview.audits.map((audit) => (
              <div key={audit.id} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#6f8b79]" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-[#3d3d38]">{humanize(audit.action)}</p>
                  <p className="mt-1 truncate text-[11px] text-[#85857e]">{audit.actorEmail ?? 'System'} · {new Date(audit.createdAt).toLocaleString()}</p>
                </div>
              </div>
            )) : <p className="text-sm text-[#77776f]">Activity will appear here as the team works.</p>}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-[20px] border border-[#dcdcd5] bg-white p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-[15px] font-semibold">Suppression list</h2>
            <p className="mt-1 text-xs text-[#77776f]">Addresses here are excluded during import and rechecked immediately before sending.</p>
          </div>
          <form onSubmit={suppress} className="grid gap-2 sm:grid-cols-[220px_240px_auto]">
            <input name="email" type="email" required placeholder="person@example.com" className="field-input" aria-label="Email to suppress" />
            <input name="reason" required maxLength={240} placeholder="Reason" className="field-input" aria-label="Suppression reason" />
            <button disabled={suppressionWorking} className="h-11 rounded-xl border border-[#d6d6cf] bg-[#fafaf8] px-4 text-sm font-medium disabled:opacity-50">{suppressionWorking ? 'Adding…' : 'Add'}</button>
          </form>
        </div>
        <div className="mt-5 divide-y divide-[#ecece7]">
          {overview.suppressions.length ? overview.suppressions.map((item) => (
            <div key={item.id} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{item.email}</p><p className="mt-0.5 text-xs text-[#85857e]">{item.reason}</p></div>
              <button onClick={() => void onRemoveSuppression(item.id)} className="self-start text-xs font-medium text-[#98523b] hover:underline sm:self-auto">Remove</button>
            </div>
          )) : <p className="py-4 text-sm text-[#77776f]">No suppressed addresses.</p>}
        </div>
      </section>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-medium text-[#5f5f58]">{label}</span>{children}</label>;
}

function AdminMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-[#deded8] bg-white p-4 sm:p-5"><p className="text-xs font-medium text-[#77776f]">{label}</p><p className="mt-2 text-xl font-semibold tracking-[-0.02em]">{value}</p><p className="mt-1 text-xs text-[#8a8a83]">{note}</p></div>;
}

function humanize(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}
