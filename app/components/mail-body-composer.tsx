'use client';

import { useDeferredValue, useMemo, useState, useSyncExternalStore } from 'react';
import {
  EmailPreviewFrame,
  HtmlNotices,
  HtmlSource,
  PreviewTabs,
  PreviewWidthToggle,
  type PreviewWidth,
} from './email-preview';
import {
  compileEmailBody,
  renderPlainTextDocument,
  renderPreviewDocument,
  UNSUBSCRIBE_PLACEHOLDER,
  type ImagePlacement,
} from '@/lib/email-html/document';
import { EMAIL_HTML_SUPPORT } from '@/lib/email-html/sanitize';

type PickedImage = { contentId: string; filename: string; mimeType: string; dataBase64: string };
type PreviewTab = 'rendered' | 'html' | 'text';

export type TestSendAccount = { id: string; email: string; canSend: boolean };
export type TestSendResult = {
  delivered: boolean;
  mockTransport: boolean;
  recipient: string;
  from: string;
};

// Mirrors the limits enforced by app/api/mail-tasks/route.ts, so the preview
// never shows an image the API would reject.
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const STARTER_TEMPLATE = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f4;padding:24px 0">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;background-color:#ffffff;border:1px solid #e2e7e3;border-radius:12px">
        <tr>
          <td style="padding:28px 32px 8px">
            <h1 style="margin:0;font-family:Arial,sans-serif;font-size:22px;line-height:1.3;color:#1f2c24">
              Your event update
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 4px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3d463f">
            <p style="margin:0 0 14px">Hi everyone,</p>
            <p style="margin:0 0 14px">
              Here is what you need to know before the event. Check the
              <a href="https://example.com/schedule" style="color:#2f6b4a">full schedule</a>
              for room details.
            </p>
            <ul style="margin:0 0 14px;padding-left:20px">
              <li style="margin-bottom:6px">Doors open at 9:00 AM</li>
              <li style="margin-bottom:6px">Bring a government photo ID</li>
              <li>Wi-Fi details are at the registration desk</li>
            </ul>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:8px 32px 28px">
            <a href="https://example.com/rsvp" style="display:inline-block;background-color:#203b2f;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:8px">
              Confirm your seat
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 26px;border-top:1px solid #eef1ee;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#7b837c">
            <p style="margin:16px 0 0">Sent by the organizing team.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

/**
 * Owns the three parts of a message body — the plain-text alternative, the
 * optional authored HTML and the inline images — and previews them through the
 * very same compiler the API uses before storing, so what is shown here is what
 * the recipient receives.
 */
export function MailBodyComposer({ disabled, subject, userEmail, gmailAccounts, onSendTest }: {
  disabled: boolean;
  subject: string;
  userEmail: string;
  gmailAccounts: TestSendAccount[];
  onSendTest: (form: FormData) => Promise<TestSendResult>;
}) {
  const [bodyText, setBodyText] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [htmlEnabled, setHtmlEnabled] = useState(false);
  const [placement, setPlacement] = useState<ImagePlacement>('above');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [tab, setTab] = useState<PreviewTab>('rendered');
  const [width, setWidth] = useState<PreviewWidth>('desktop');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [testAccountId, setTestAccountId] = useState('');
  const [testWorking, setTestWorking] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  // Reading window during render would make the server and client markup differ
  // and fail hydration; a store with a server snapshot is the safe way in.
  const origin = useSyncExternalStore(subscribeToOrigin, getOrigin, getServerOrigin);

  // Typing in a large template should not recompile on every keystroke.
  const deferredHtml = useDeferredValue(htmlEnabled ? bodyHtml : '');
  const deferredText = useDeferredValue(bodyText);

  // The real link is only known once the mail task has an id, so the preview
  // uses a same-shaped stand-in. The footer itself is exactly what is sent.
  const compiled = useMemo(() => compileEmailBody({
    bodyHtml: deferredHtml,
    bodyText: deferredText,
    contentIds: images.map((image) => image.contentId),
    placement,
    unsubscribeUrl: `${origin}/unsubscribe?t=example-link`,
  }), [deferredHtml, deferredText, images, placement, origin]);

  const previewDocument = useMemo(
    () => renderPreviewDocument({ bodyHtml: compiled.html, images, subject }),
    [compiled.html, images, subject],
  );
  const textDocument = useMemo(() => renderPlainTextDocument(compiled.text), [compiled.text]);
  // A body of nothing but a decorative image still has something to preview.
  const isEmpty = !compiled.text.trim() && !images.length && !/<img\b/i.test(compiled.html);

  async function pickImages(files: FileList | null) {
    setImageError(null);
    const picked = Array.from(files ?? []).filter((file) => file.size > 0);
    setImageFiles(picked);
    if (!picked.length) {
      setImages([]);
      return;
    }
    if (picked.length > MAX_IMAGES) {
      setImageError(`Attach at most ${MAX_IMAGES} images.`);
      setImages([]);
      return;
    }
    const wrongType = picked.find((file) => !ALLOWED_IMAGE_TYPES.includes(file.type));
    if (wrongType) {
      setImageError(`${wrongType.name} is not a PNG, JPEG, GIF, or WebP image.`);
      setImages([]);
      return;
    }
    const tooLarge = picked.find((file) => file.size > MAX_IMAGE_BYTES);
    if (tooLarge) {
      setImageError(`${tooLarge.name} is larger than 2 MB. Every recipient set carries a copy, so keep images small.`);
      setImages([]);
      return;
    }
    if (picked.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_IMAGE_BYTES) {
      setImageError('The attached images add up to more than 8 MB.');
      setImages([]);
      return;
    }
    try {
      const read = await Promise.all(picked.map(async (file, index) => ({
        contentId: `image${index + 1}`,
        filename: file.name,
        mimeType: file.type,
        dataBase64: await toBase64(file),
      })));
      setImages(read);
    } catch {
      setImageError('One of the images could not be read for the preview.');
      setImages([]);
    }
  }

  const sendableAccounts = gmailAccounts.filter((account) => account.canSend);
  const selectedAccountId = sendableAccounts.some((account) => account.id === testAccountId)
    ? testAccountId
    : sendableAccounts[0]?.id ?? '';
  const canSendTest = Boolean(selectedAccountId) && Boolean(subject.trim()) && !isEmpty && !disabled;

  async function sendTest() {
    if (!canSendTest) return;
    setTestWorking(true);
    setTestResult(null);
    try {
      const form = new FormData();
      form.set('subject', subject);
      form.set('gmailAccountId', selectedAccountId);
      form.set('imagePlacement', placement);
      if (bodyText.trim()) form.set('bodyText', bodyText);
      if (htmlEnabled && bodyHtml.trim()) form.set('bodyHtml', bodyHtml);
      for (const file of imageFiles) form.append('images', file);
      const result = await onSendTest(form);
      setTestResult(result.mockTransport
        ? `Mock transport is on, so nothing was delivered. With a real Gmail account this would have gone to ${result.recipient}.`
        : `Sent to ${result.recipient} from ${result.from}. Open it in your inbox to see exactly what recipients get.`);
    } catch (error) {
      setTestResult(error instanceof Error ? error.message : 'The test email could not be sent.');
    } finally {
      setTestWorking(false);
    }
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div>
          <span className="mb-1.5 block text-xs font-medium text-[#4f5a52]">Body format</span>
          <div role="group" aria-label="Body format" className="inline-flex rounded-xl border border-[#dcdcd5] bg-[#fafaf8] p-0.5">
            {([
              { id: false, label: 'Plain text' },
              { id: true, label: 'HTML design' },
            ] as const).map((option) => (
              <button
                key={String(option.id)}
                type="button"
                disabled={disabled}
                aria-pressed={htmlEnabled === option.id}
                onClick={() => {
                  setHtmlEnabled(option.id);
                  if (option.id && !bodyHtml.trim()) setBodyHtml(STARTER_TEMPLATE);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${htmlEnabled === option.id ? 'bg-white text-[#26342b] shadow-sm' : 'text-[#767e77] hover:text-[#3d4a41]'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-[#7f877f]">
            {htmlEnabled
              ? 'Lay the email out with tables, headings, lists, links, buttons, colours and inline CSS. The plain-text part is built from it automatically.'
              : 'Type the message as plain text. Relay wraps it in a simple HTML document for the other half of the message.'}
          </p>
        </div>

        {htmlEnabled ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#4f5a52]">HTML body</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setBodyHtml(STARTER_TEMPLATE)}
                  className="rounded-lg border border-[#d6ded8] bg-white px-2.5 py-1 text-[11px] font-medium text-[#43604f] transition hover:bg-[#f4f8f5] disabled:opacity-50"
                >
                  Insert starter layout
                </button>
                <button
                  type="button"
                  disabled={disabled || !bodyHtml}
                  onClick={() => setBodyHtml('')}
                  className="rounded-lg border border-[#d6ded8] bg-white px-2.5 py-1 text-[11px] font-medium text-[#7b837c] transition hover:bg-[#f7f7f5] disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </div>
            <textarea
              name="bodyHtml"
              rows={16}
              maxLength={200000}
              disabled={disabled}
              value={bodyHtml}
              onChange={(event) => setBodyHtml(event.target.value)}
              spellCheck={false}
              className="field-input min-h-72 resize-y py-3 font-mono text-xs leading-5"
              placeholder={'<table role="presentation" width="100%">\n  <tr><td>Hi everyone,</td></tr>\n</table>'}
            />
            <p className="text-[11px] leading-4 text-[#7f877f]">
              Every message gets an unsubscribe footer, because mailbox providers expect one on bulk
              mail. Put <code className="rounded bg-[#eef1ee] px-1">{UNSUBSCRIBE_PLACEHOLDER}</code> in
              an <code className="rounded bg-[#eef1ee] px-1">href</code> to place the link inside your own
              design instead.
            </p>
            <SupportedTagsReference />
          </div>
        ) : (
          <label className="block">
            <span className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-[#4f5a52]">Plain-text body</span>
              <span className="text-[11px] text-[#8b938c]">Required</span>
            </span>
            <textarea
              name="bodyText"
              required
              rows={10}
              maxLength={50000}
              disabled={disabled}
              value={bodyText}
              onChange={(event) => setBodyText(event.target.value)}
              className="field-input min-h-32 resize-y py-3"
              placeholder="Write the message volunteers will send…"
            />
          </label>
        )}

        {htmlEnabled ? (
          <details className="rounded-2xl border border-[#e0e5e0] bg-[#fafbfa]">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#526057]">
              Plain-text fallback
              <span className="ml-2 text-[11px] font-normal text-[#8b938c]">
                Optional — {compiled.textDerived ? 'built from your HTML' : 'overridden below'}
              </span>
            </summary>
            <div className="border-t border-[#e7ebe7] p-4">
              <textarea
                name="bodyText"
                rows={6}
                maxLength={50000}
                disabled={disabled}
                value={bodyText}
                onChange={(event) => setBodyText(event.target.value)}
                className="field-input min-h-28 resize-y py-3"
                placeholder="Leave empty to use the text built from your HTML…"
              />
              <p className="mt-1.5 text-[11px] leading-4 text-[#8b938c]">
                Text-only mail clients read this half of the message. Leave it empty and Relay derives
                it from your HTML — the Text part tab shows exactly what gets sent.
              </p>
            </div>
          </details>
        ) : null}

        <div className="rounded-2xl border border-[#e0e5e0] bg-[#fafbfa] p-4">
          <p className="text-sm font-semibold text-[#3f4c44]">Inline images</p>
          <p className="mt-0.5 text-[11px] leading-4 text-[#7f877f]">
            Up to {MAX_IMAGES}, 2 MB each. They are embedded in the message, so they display without
            the recipient having to load remote content.
          </p>
          <input
            name="images"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            disabled={disabled}
            onChange={(event) => void pickImages(event.target.files)}
            className="file-input mt-3"
          />
          {imageError ? <p role="alert" className="mt-2 text-[11px] text-[#a1503a]">{imageError}</p> : null}
          {images.length ? (
            <ul className="mt-3 space-y-1.5">
              {images.map((image) => (
                <li key={image.contentId} className="flex items-center justify-between gap-3 rounded-lg border border-[#e4e9e5] bg-white px-2.5 py-1.5">
                  <span className="truncate text-[11px] text-[#5c655e]">{image.filename}</span>
                  <code className="shrink-0 rounded bg-[#f1f4f1] px-1.5 py-0.5 font-mono text-[10px] text-[#4a6a55]">cid:{image.contentId}</code>
                </li>
              ))}
            </ul>
          ) : null}
          {images.length && htmlEnabled ? (
            <p className="mt-2.5 text-[11px] leading-4 text-[#7f877f]">
              Place each one in your HTML with <code className="rounded bg-[#eef1ee] px-1">&lt;img src=&quot;cid:image1&quot;&gt;</code>.
            </p>
          ) : null}
          {images.length && !htmlEnabled ? (
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-medium text-[#4f5a52]">Image placement</span>
              <select
                name="imagePlacement"
                value={placement}
                disabled={disabled}
                onChange={(event) => setPlacement(event.target.value as ImagePlacement)}
                className="field-input"
              >
                <option value="above">Above the text</option>
                <option value="below">Below the text</option>
              </select>
            </label>
          ) : (
            <input type="hidden" name="imagePlacement" value={placement} />
          )}
        </div>
      </div>

      <div className="lg:sticky lg:top-24">
        <div className="rounded-2xl border border-[#dce2dc] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#899089]">Live preview</p>
              <p className="mt-0.5 text-xs text-[#7b837c]">Exactly the message body that will be sent</p>
            </div>
            {tab === 'rendered' ? <PreviewWidthToggle value={width} onChange={setWidth} /> : null}
          </div>

          <div className="mt-3">
            <PreviewTabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'rendered', label: 'Rendered' },
                { id: 'html', label: 'HTML part', badge: `${compiled.html.length.toLocaleString()} chars` },
                { id: 'text', label: 'Text part', badge: compiled.textDerived ? 'auto' : undefined },
              ]}
            />
          </div>

          <div className="mt-3 space-y-3">
            <MailHeaderStrip subject={subject} />
            {isEmpty ? (
              <div className="grid h-52 place-items-center rounded-xl border border-dashed border-[#dfe4df] bg-[#fbfcfb] px-6 text-center">
                <p className="text-xs leading-5 text-[#8b938c]">
                  Write the plain-text body or the HTML body — either one on its own is enough —
                  and the preview renders here.
                </p>
              </div>
            ) : tab === 'rendered' ? (
              <EmailPreviewFrame srcDoc={previewDocument} title="Rendered email preview" width={width} />
            ) : tab === 'html' ? (
              <HtmlSource html={compiled.html} />
            ) : (
              <>
                {compiled.textDerived && compiled.text ? (
                  <p className="rounded-xl border border-[#dbe4dd] bg-[#f7faf8] px-3 py-2 text-[11px] leading-4 text-[#4f6a58]">
                    Built from your HTML because the plain-text body is empty. This is the exact
                    text/plain part recipients on text-only clients will read.
                  </p>
                ) : null}
                <EmailPreviewFrame srcDoc={textDocument} title="Plain-text email preview" />
              </>
            )}
            <HtmlNotices warnings={compiled.warnings} />
          </div>

          <div className="mt-4 border-t border-[#edf0ed] pt-4">
            <p className="text-xs font-semibold text-[#3f4c44]">Send a test to yourself</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#7f877f]">
              Delivers this exact message to <strong className="font-medium text-[#5c655e]">{userEmail}</strong> and
              nobody else — no Bcc, no participants — through the same sending path a real set uses.
              A mail client is the final word on how HTML renders.
            </p>
            {sendableAccounts.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {sendableAccounts.length > 1 ? (
                  <select
                    aria-label="Send the test from"
                    value={selectedAccountId}
                    disabled={disabled || testWorking}
                    onChange={(event) => setTestAccountId(event.target.value)}
                    className="field-input h-9 w-auto max-w-56 text-xs"
                  >
                    {sendableAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.email}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] text-[#8b938c]">from {sendableAccounts[0].email}</span>
                )}
                <button
                  type="button"
                  disabled={!canSendTest || testWorking}
                  onClick={() => void sendTest()}
                  className="h-9 rounded-xl bg-[#203b2f] px-4 text-xs font-semibold text-white transition hover:bg-[#294a3a] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {testWorking ? 'Sending test…' : 'Send test email'}
                </button>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-[#ead8bb] bg-[#fff9ef] p-2.5 text-[11px] leading-4 text-[#7a5419]">
                Connect a Gmail account with send permission to try this.
              </p>
            )}
            {!canSendTest && sendableAccounts.length ? (
              <p className="mt-2 text-[11px] leading-4 text-[#8b938c]">
                {!subject.trim() ? 'Add a subject first.' : isEmpty ? 'Write the body first.' : null}
              </p>
            ) : null}
            {testResult ? (
              <p role="status" className="mt-2 rounded-xl border border-[#dbe4dd] bg-[#f7faf8] p-2.5 text-[11px] leading-4 text-[#3f5c49]">
                {testResult}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MailHeaderStrip({ subject }: { subject: string }) {
  return (
    <div className="rounded-xl border border-[#e6ebe6] bg-[#f8faf8] px-3.5 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8e968f]">Subject</p>
      <p className="mt-0.5 truncate text-sm font-medium text-[#2f3a33]">{subject.trim() || 'No subject yet'}</p>
    </div>
  );
}

function SupportedTagsReference() {
  return (
    <details className="rounded-xl border border-[#e4e9e5] bg-white">
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-[#5b665e]">
        Supported tags and attributes
      </summary>
      <div className="space-y-3 border-t border-[#eef1ee] px-3 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8e968f]">Tags</p>
          <p className="mt-1 font-mono text-[10px] leading-5 text-[#5f6a62]">
            {EMAIL_HTML_SUPPORT.tags.join(' · ')}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8e968f]">On every tag</p>
          <p className="mt-1 font-mono text-[10px] leading-5 text-[#5f6a62]">
            {EMAIL_HTML_SUPPORT.globalAttributes.join(' · ')}
          </p>
        </div>
        <p className="text-[10px] leading-4 text-[#8b938c]">
          Scripts, forms, iframes, embedded media and event handlers are removed. Inline
          <code className="mx-1 rounded bg-[#f1f4f1] px-1">style</code>
          keeps the usual colour, font, spacing, border, sizing and alignment properties.
        </p>
      </div>
    </details>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma < 0 ? '' : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

const subscribeToOrigin = () => () => undefined;
const getOrigin = () => window.location.origin;
const getServerOrigin = () => '';
