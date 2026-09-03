'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminPanel } from './admin-panel';
import { BatchPicker } from './batch-picker';
import { MyBatchesPanel } from './my-batches-panel';
import { RelayShell } from './relay-shell';
import type { AppView, BatchPreview, Overview } from './types';

export function RelayApp({ view, eventId, mailTaskId }: { view: AppView; eventId?: string | null; mailTaskId?: string | null }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (eventId) params.set('eventId', eventId);
    if (mailTaskId) params.set('mailTaskId', mailTaskId);
    try {
      const response = await fetch(`/api/overview?${params}`, { cache: 'no-store' });
      if (response.status === 401) {
        redirectToSignIn();
        return;
      }
      const data = await response.json() as Overview & { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? 'Could not load Relay.');
      setOverview(data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load Relay.');
    }
  }, [eventId, mailTaskId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('gmail') === 'connected') setNotice('Gmail account connected securely.');
      if (params.get('gmail') === 'error') setError(params.get('message') ?? 'Gmail connection failed.');
      if (params.get('joined') === '1') setNotice('Invitation accepted. This event is now available in your dashboard.');
      if (params.has('gmail') || params.has('message') || params.has('joined')) {
        params.delete('gmail');
        params.delete('message');
        params.delete('joined');
        const query = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init.headers } });
    if (response.status === 401) {
      redirectToSignIn();
      throw new Error('Your session expired. Redirecting to sign in…');
    }
    const data = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message ?? 'The request could not be completed.');
    return data;
  }

  async function previewBatch(batchId: string) {
    setError(null);
    try {
      return await api<BatchPreview>(`/api/batches/preview?batchId=${encodeURIComponent(batchId)}`);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Could not open the preview.');
      throw previewError;
    }
  }

  async function sendBatch(batchId: string, gmailAccountId: string) {
    setError(null);
    try {
      await api('/api/sends', { method: 'POST', body: JSON.stringify({ batchId, gmailAccountId }) });
      setNotice('One Gmail message was sent successfully with the full set in BCC.');
      await load();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'The set could not be sent.');
      await load();
      throw sendError;
    }
  }

  async function addMockAccount() {
    setError(null);
    try {
      await api('/api/gmail/accounts', { method: 'POST', body: '{}' });
      setNotice('A safe test Gmail account was added.');
      await load();
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : 'Could not add the account.');
    }
  }

  async function disconnectGmailAccount(id: string) {
    setError(null);
    try {
      const result = await api<{ email: string }>('/api/gmail/accounts', { method: 'DELETE', body: JSON.stringify({ id }) });
      setNotice(`${result.email} was disconnected. Relay can no longer send from it.`);
      await load();
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : 'Could not disconnect the account.');
    }
  }

  async function createEvent(form: FormData) {
    setError(null);
    const response = await fetch('/api/events', { method: 'POST', body: form });
    if (response.status === 401) {
      redirectToSignIn();
      throw new Error('Your session expired. Redirecting to sign in…');
    }
    const data = await response.json() as { eventId: string; accepted: number; invalid: number; duplicates: number; error?: { message?: string } };
    if (!response.ok) {
      const message = data.error?.message ?? 'Event import failed.';
      setError(message);
      throw new Error(message);
    }
    setNotice(`Event created with ${data.accepted} recipients. Add its first mail task now.`);
    await load();
    return data;
  }

  async function deleteEvent(eventToDeleteId: string) {
    setError(null);
    try {
      const result = await api<{ eventId: string; eventName: string }>('/api/events', {
        method: 'DELETE',
        body: JSON.stringify({ eventId: eventToDeleteId }),
      });
      setNotice(`${result.eventName} was deleted.`);
      await load();
      return result;
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The event could not be deleted.');
      throw deleteError;
    }
  }

  async function createMailTask(form: FormData) {
    // Sent as multipart so the optional inline images ride along with the fields.
    setError(null);
    const response = await fetch('/api/mail-tasks', { method: 'POST', body: form });
    if (response.status === 401) {
      redirectToSignIn();
      throw new Error('Your session expired. Redirecting to sign in…');
    }
    const data = await response.json() as { mailTaskId: string; batches: number; batchSizes: number[]; htmlWarnings?: string[]; error?: { message?: string } };
    if (!response.ok) {
      const message = data.error?.message ?? 'The mail task could not be created.';
      setError(message);
      throw new Error(message);
    }
    const adjusted = data.htmlWarnings?.length
      ? ` ${data.htmlWarnings.length} HTML adjustment${data.htmlWarnings.length === 1 ? '' : 's'} were applied for email compatibility.`
      : '';
    setNotice(`Mail task created with ${data.batches} sets (${data.batchSizes.join(', ')}).${adjusted}`);
    await load();
    return data;
  }

  async function sendTestMail(form: FormData) {
    // Multipart so any inline images ride along, exactly as the create call does.
    setError(null);
    const response = await fetch('/api/mail-tasks/test', { method: 'POST', body: form });
    if (response.status === 401) {
      redirectToSignIn();
      throw new Error('Your session expired. Redirecting to sign in…');
    }
    const data = await response.json() as {
      delivered: boolean; mockTransport: boolean; recipient: string; from: string;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(data.error?.message ?? 'The test email could not be sent.');
    return data;
  }

  async function addSuppression(email: string, reason: string) {
    try {
      await api('/api/suppressions', { method: 'POST', body: JSON.stringify({ email, reason }) });
      setNotice(`${email} will be excluded from future mail tasks.`);
      await load();
    } catch (suppressionError) {
      setError(suppressionError instanceof Error ? suppressionError.message : 'Could not add suppression.');
      throw suppressionError;
    }
  }

  async function removeSuppression(id: string) {
    try {
      await api('/api/suppressions', { method: 'DELETE', body: JSON.stringify({ id }) });
      setNotice('Suppression removed.');
      await load();
    } catch (suppressionError) {
      setError(suppressionError instanceof Error ? suppressionError.message : 'Could not remove suppression.');
      throw suppressionError;
    }
  }

  async function createEventInvite(invitedEventId: string) {
    try {
      const invite = await api<{ id: string; eventId: string; eventName: string; url: string; expiresAt: string }>('/api/events/invite', { method: 'POST', body: JSON.stringify({ eventId: invitedEventId }) });
      setNotice('Event-only invitation link created and copied.');
      await load();
      return invite;
    } catch (inviteError) { setError(inviteError instanceof Error ? inviteError.message : 'Could not create invitation.'); throw inviteError; }
  }

  async function revokeEventInvite(inviteId: string) {
    try {
      await api('/api/events/invite', { method: 'DELETE', body: JSON.stringify({ inviteId }) });
      setNotice('Event invitation revoked.');
      await load();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Could not revoke invitation.');
      throw inviteError;
    }
  }

  if (!overview && !error) return <RelayLoading />;
  if (!overview) return <RelayFailure message={error ?? 'Could not load Relay.'} onRetry={load} />;

  return (
    <RelayShell overview={overview} activeView={view}>
      {notice ? <Toast tone="success" message={notice} onClose={() => setNotice(null)} /> : null}
      {error ? <Toast tone="error" message={error} onClose={() => setError(null)} /> : null}
      {view === 'campaign' ? <BatchPicker overview={overview} onPreview={previewBatch} onSend={sendBatch} onAddMockAccount={addMockAccount} /> : null}
      {view === 'batches' ? <MyBatchesPanel overview={overview} onAddMockAccount={addMockAccount} onDisconnectAccount={disconnectGmailAccount} /> : null}
      {view === 'admin' ? <AdminPanel overview={overview} onCreateEvent={createEvent} onDeleteEvent={deleteEvent} onCreateMailTask={createMailTask} onSendTestMail={sendTestMail} onAddSuppression={addSuppression} onRemoveSuppression={removeSuppression} onCreateInvite={createEventInvite} onRevokeInvite={revokeEventInvite} /> : null}
    </RelayShell>
  );
}

function redirectToSignIn() {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`/auth/sign-in?redirectTo=${encodeURIComponent(returnTo)}`);
}

function Toast({ tone, message, onClose }: { tone: 'success' | 'error'; message: string; onClose: () => void }) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`fixed right-4 top-20 z-50 flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg ${tone === 'error' ? 'border-[#e5c8be] bg-[#fff8f5] text-[#8a4936]' : 'border-[#c9ddcf] bg-[#f5fbf7] text-[#315e43]'}`}><span>{tone === 'error' ? '!' : '✓'}</span><span className="leading-5">{message}</span><button onClick={onClose} className="ml-2 text-lg leading-4 opacity-60" aria-label="Dismiss">×</button></div>;
}

function RelayLoading() {
  return <div className="min-h-screen bg-[#f7f7f5] p-10"><div className="mx-auto h-96 max-w-5xl animate-pulse rounded-3xl bg-white" /></div>;
}

function RelayFailure({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return <div className="grid min-h-screen place-items-center bg-[#f7f7f5] p-5"><div className="max-w-md rounded-3xl border border-[#deded8] bg-white p-8 text-center"><h1 className="text-xl font-semibold">Relay could not open</h1><p className="mt-2 text-sm leading-6 text-[#77776f]">{message}</p><button onClick={() => void onRetry()} className="mt-5 h-10 rounded-xl bg-[#263d32] px-4 text-sm font-semibold text-white">Try again</button></div></div>;
}
