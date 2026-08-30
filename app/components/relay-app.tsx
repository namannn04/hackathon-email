'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPanel } from './admin-panel';
import { BatchPicker } from './batch-picker';
import { MyBatchesPanel } from './my-batches-panel';
import { RelayShell } from './relay-shell';
import type { AppView, Overview } from './types';

export function RelayApp({ view, campaignId }: { view: AppView; campaignId?: string | null }) {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : '';
    try {
      const response = await fetch(`/api/overview${query}`, { cache: 'no-store' });
      const data = await response.json() as Overview | { error?: { message?: string } };
      if (!response.ok) throw new Error('error' in data ? data.error?.message : 'Could not load Relay.');
      setOverview(data as Overview);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load Relay.');
    }
  }, [campaignId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!overview?.myBatches.some((batch) => batch.status === 'SENDING')) return;
    const timer = window.setInterval(() => { void load(); }, 2_000);
    return () => window.clearInterval(timer);
  }, [load, overview?.myBatches]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('gmail') === 'connected') setNotice('Gmail account connected securely.');
      if (params.get('gmail') === 'error') setError(params.get('message') ?? 'Gmail connection failed.');
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function api<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    });
    const data = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message ?? 'The request could not be completed.');
    return data;
  }

  async function claim(batchIds: string[]) {
    if (!overview?.campaign) return;
    setError(null);
    try {
      await api('/api/batches/claim', {
        method: 'POST',
        body: JSON.stringify({ campaignId: overview.campaign.id, batchIds }),
      });
      router.push('/my-batches?claimed=1');
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'The batches could not be claimed.');
    }
  }

  async function assign(batchId: string, gmailAccountId: string) {
    setError(null);
    try {
      await api('/api/batches/assign', { method: 'POST', body: JSON.stringify({ batchId, gmailAccountId }) });
      setNotice('Gmail account assigned.');
      await load();
    } catch (assignmentError) {
      setError(assignmentError instanceof Error ? assignmentError.message : 'Assignment failed.');
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

  async function send(batchIds: string[]) {
    setError(null);
    const results = await Promise.allSettled(
      batchIds.map((batchId) => api('/api/sends', { method: 'POST', body: JSON.stringify({ batchId }) })),
    );
    await load();
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) {
      const message = failed.reason instanceof Error ? failed.reason.message : 'A batch could not be sent.';
      setError(message);
      return;
    }
    setNotice(`${batchIds.length} ${batchIds.length === 1 ? 'batch' : 'batches'} sent successfully.`);
  }

  async function createCampaign(form: FormData) {
    setError(null);
    const response = await fetch('/api/campaigns', { method: 'POST', body: form });
    const data = await response.json() as {
      campaignId: string;
      batches: number;
      accepted: number;
      sendable: number;
      invalid: number;
      duplicates: number;
      suppressed: number;
      error?: { message?: string };
    };
    if (!response.ok) {
      const message = data.error?.message ?? 'Campaign import failed.';
      setError(message);
      throw new Error(message);
    }
    setNotice('Campaign imported and opened to volunteers.');
    await load();
    return data;
  }

  async function addSuppression(email: string, reason: string) {
    setError(null);
    try {
      await api('/api/suppressions', { method: 'POST', body: JSON.stringify({ email, reason }) });
      setNotice(`${email} will be excluded from future sends.`);
      await load();
    } catch (suppressionError) {
      setError(suppressionError instanceof Error ? suppressionError.message : 'Could not add the suppression.');
    }
  }

  async function removeSuppression(id: string) {
    setError(null);
    try {
      await api('/api/suppressions', { method: 'DELETE', body: JSON.stringify({ id }) });
      setNotice('Suppression removed.');
      await load();
    } catch (suppressionError) {
      setError(suppressionError instanceof Error ? suppressionError.message : 'Could not remove the suppression.');
    }
  }

  if (!overview && !error) return <RelayLoading />;
  if (!overview) return <RelayFailure message={error ?? 'Could not load Relay.'} onRetry={load} />;

  return (
    <RelayShell overview={overview} activeView={view}>
      {notice ? <Toast tone="success" message={notice} onClose={() => setNotice(null)} /> : null}
      {error ? <Toast tone="error" message={error} onClose={() => setError(null)} /> : null}
      {view === 'campaign' ? <BatchPicker overview={overview} onClaim={claim} /> : null}
      {view === 'batches' ? <MyBatchesPanel overview={overview} onAssign={assign} onAddMockAccount={addMockAccount} onSend={send} /> : null}
      {view === 'admin' ? <AdminPanel overview={overview} onCreateCampaign={createCampaign} onAddSuppression={addSuppression} onRemoveSuppression={removeSuppression} /> : null}
    </RelayShell>
  );
}

function Toast({ tone, message, onClose }: { tone: 'success' | 'error'; message: string; onClose: () => void }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`fixed right-4 top-20 z-50 flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg ${tone === 'error' ? 'border-[#e5c8be] bg-[#fff8f5] text-[#8a4936]' : 'border-[#c9ddcf] bg-[#f5fbf7] text-[#315e43]'}`}>
      <span aria-hidden="true">{tone === 'error' ? '!' : '✓'}</span><span className="leading-5">{message}</span><button onClick={onClose} className="ml-2 text-lg leading-4 opacity-60" aria-label="Dismiss">×</button>
    </div>
  );
}

function RelayLoading() {
  return <div className="min-h-screen bg-[#f7f7f5] p-5 sm:p-10"><div className="mx-auto max-w-5xl animate-pulse"><div className="mb-10 h-10 w-36 rounded-xl bg-[#e3e3dd]" /><div className="h-8 w-80 max-w-full rounded-lg bg-[#e3e3dd]" /><div className="mt-4 h-4 w-[520px] max-w-full rounded bg-[#e9e9e4]" /><div className="mt-10 grid gap-3 sm:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-28 rounded-2xl bg-white" />)}</div><div className="mt-6 h-80 rounded-[20px] bg-white" /></div></div>;
}

function RelayFailure({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return <div className="grid min-h-screen place-items-center bg-[#f7f7f5] p-5"><div className="max-w-md rounded-[22px] border border-[#deded8] bg-white p-8 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#fbefeb] text-[#98523b]">!</span><h1 className="mt-4 text-xl font-semibold">Relay could not open</h1><p className="mt-2 text-sm leading-6 text-[#77776f]">{message}</p><button onClick={() => void onRetry()} className="mt-5 h-10 rounded-xl bg-[#263d32] px-4 text-sm font-semibold text-white">Try again</button></div></div>;
}
