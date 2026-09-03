'use client';

import { useCallback, useRef, useState } from 'react';

export type PreviewWidth = 'desktop' | 'mobile';

const MIN_FRAME_HEIGHT = 240;
const MAX_FRAME_HEIGHT = 900;

/**
 * Renders an email body the way a mail client would: an isolated document with
 * its own styles, so the app's Tailwind reset cannot leak in and flatter the
 * markup. The frame is sandboxed without allow-scripts, so nothing inside can
 * execute; allow-same-origin only exists so the height can be measured.
 */
export function EmailPreviewFrame({ src, srcDoc, title, width = 'desktop' }: {
  src?: string;
  srcDoc?: string;
  title: string;
  width?: PreviewWidth;
}) {
  const [height, setHeight] = useState(360);
  const frame = useRef<HTMLIFrameElement | null>(null);

  const measure = useCallback(() => {
    try {
      const document = frame.current?.contentDocument;
      const measured = document?.documentElement?.scrollHeight ?? 0;
      if (measured > 0) setHeight(Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, measured + 8)));
    } catch {
      // A cross-origin document cannot be measured; the default height stands.
    }
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-[#e0e0da] bg-white">
      <div className={`mx-auto transition-[max-width] duration-200 ${width === 'mobile' ? 'max-w-[390px] border-x border-[#ececeb]' : 'max-w-full'}`}>
        <iframe
          ref={frame}
          src={src}
          srcDoc={srcDoc}
          title={title}
          onLoad={measure}
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          className="block w-full bg-white"
          style={{ height }}
        />
      </div>
    </div>
  );
}

export function PreviewWidthToggle({ value, onChange }: { value: PreviewWidth; onChange: (next: PreviewWidth) => void }) {
  return (
    <div role="group" aria-label="Preview width" className="inline-flex rounded-lg border border-[#dcdcd5] bg-[#fafaf8] p-0.5">
      {(['desktop', 'mobile'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition ${value === option ? 'bg-white text-[#2b3830] shadow-sm' : 'text-[#7b837c]'}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function PreviewTabs<T extends string>({ value, onChange, tabs }: {
  value: T;
  onChange: (next: T) => void;
  tabs: Array<{ id: T; label: string; badge?: string }>;
}) {
  return (
    <div role="tablist" aria-label="Email parts" className="flex flex-wrap gap-1 rounded-xl border border-[#dcdcd5] bg-[#fafaf8] p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${value === tab.id ? 'bg-white text-[#26342b] shadow-sm' : 'text-[#767e77] hover:text-[#3d4a41]'}`}
        >
          {tab.label}
          {tab.badge ? <span className="ml-1.5 text-[10px] text-[#8e968f]">{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Reports every change the email-HTML compiler made to the authored markup. */
export function HtmlNotices({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="rounded-xl border border-[#ead8bb] bg-[#fffdf7] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a6a2c]">
        {warnings.length} adjustment{warnings.length === 1 ? '' : 's'} made for email compatibility
      </p>
      <ul className="mt-2 space-y-1.5">
        {warnings.map((warning) => (
          <li key={warning} className="flex gap-2 text-[11px] leading-4 text-[#7a5f26]">
            <span aria-hidden className="mt-px text-[#c0a463]">•</span>
            <span>{warning}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HtmlSource({ html }: { html: string }) {
  return (
    <pre className="max-h-[420px] overflow-auto rounded-xl border border-[#e0e0da] bg-[#fbfbf9] p-3.5 font-mono text-[11px] leading-5 text-[#4b544d]">
      <code>{html}</code>
    </pre>
  );
}
