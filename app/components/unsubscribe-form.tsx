'use client';

import { useState } from 'react';

/**
 * Asks which address received the message, because one Gmail message carries a
 * whole set in Bcc and so the link itself cannot know who clicked it.
 */
export function UnsubscribeForm({ token, eventName }: { token: string; eventName: string | null }) {
  const [email, setEmail] = useState('');
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const response = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, email }),
      });
      const data = await response.json() as { accepted?: boolean; error?: { message?: string } | string };
      if (!response.ok || !data.accepted) {
        const message = typeof data.error === 'string' ? data.error : data.error?.message;
        throw new Error(message ?? 'The request could not be completed.');
      }
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The request could not be completed.');
    } finally {
      setWorking(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-[#cee0d3] bg-[#f2f8f4] p-5 text-left">
        <p className="text-sm font-semibold text-[#2d5c40]">You are unsubscribed</p>
        <p className="mt-2 text-sm leading-6 text-[#41654f]">
          If <strong className="font-medium">{email}</strong> was on this organizer&rsquo;s list, it has been
          removed. Every future mailing from them will skip it. You can close this page.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="text-left">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[#4f5a52]">
          Email address that received the message
        </span>
        <input
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          value={email}
          disabled={working}
          onChange={(event) => setEmail(event.target.value)}
          className="field-input"
          placeholder="you@example.com"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-[#e5c8be] bg-[#fff8f5] p-3 text-xs leading-5 text-[#8a4936]">
          {error}
        </p>
      ) : null}
      <button
        disabled={working}
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#203b2f] px-5 text-sm font-semibold text-white transition hover:bg-[#294a3a] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {working ? 'Unsubscribing…' : 'Unsubscribe me'}
      </button>
      <p className="mt-3 text-[11px] leading-4 text-[#8b938c]">
        {eventName
          ? `This stops all future mail from this organizer, not only ${eventName}.`
          : 'This stops all future mail from this organizer.'}
      </p>
    </form>
  );
}
