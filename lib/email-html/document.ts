import { htmlToPlainText } from './plain-text';
import { sanitizeEmailHtml, type EmailHtmlResult } from './sanitize';

export type ImagePlacement = 'above' | 'below';

/**
 * Where an organizer can place the unsubscribe link inside their own markup.
 * When it is absent, a footer carrying the link is appended instead, so every
 * message has a visible way out — which mailbox providers expect from bulk mail.
 */
export const UNSUBSCRIBE_PLACEHOLDER = '{{unsubscribe_url}}';

export type EmailBody = {
  /** The text/html part, byte-for-byte what the message carries. */
  html: string;
  /** The text/plain part, derived from the HTML when none was written. */
  text: string;
  /** True when `text` came from the HTML rather than from the organizer. */
  textDerived: boolean;
  warnings: string[];
};

export type PreviewImage = {
  contentId: string;
  mimeType: string;
  dataBase64: string;
};

/**
 * Compiles both halves of a multipart/alternative body from what the organizer
 * typed. Either field may be left empty: HTML alone gets a text part derived
 * from it, plain text alone gets a simple HTML document built from it.
 *
 * Server and browser both call this, so the compose preview and the delivered
 * message are produced by the same code from the same input.
 */
export function compileEmailBody(input: {
  bodyHtml?: string;
  bodyText?: string;
  contentIds: string[];
  placement?: ImagePlacement;
  unsubscribeUrl?: string;
}): EmailBody {
  const typedText = input.bodyText?.trim() ? input.bodyText : '';
  const compiled = compileBodyHtml({
    bodyHtml: input.bodyHtml,
    bodyText: typedText,
    contentIds: input.contentIds,
    placement: input.placement,
  });

  const html = applyUnsubscribeToHtml(compiled.html, input.unsubscribeUrl);
  if (typedText) {
    return {
      html,
      text: applyUnsubscribeToText(typedText, input.unsubscribeUrl),
      textDerived: false,
      warnings: compiled.warnings,
    };
  }
  return {
    html,
    // Derived from the finished HTML, so the footer is described once, not twice.
    text: htmlToPlainText(html),
    textDerived: true,
    warnings: compiled.warnings,
  };
}

function applyUnsubscribeToHtml(html: string, unsubscribeUrl: string | undefined): string {
  if (!unsubscribeUrl) return html;
  if (html.includes(UNSUBSCRIBE_PLACEHOLDER)) {
    return html.replaceAll(UNSUBSCRIBE_PLACEHOLDER, escapeAttribute(unsubscribeUrl));
  }
  return `${html}<div style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid #e4e6e4;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#777780;text-align:center">`
    + `You received this because you signed up for one of our events. `
    + `<a href="${escapeAttribute(unsubscribeUrl)}" target="_blank" rel="noopener noreferrer" style="color:#777780;text-decoration:underline">Unsubscribe</a>`
    + '</div>';
}

function applyUnsubscribeToText(text: string, unsubscribeUrl: string | undefined): string {
  if (!unsubscribeUrl) return text;
  if (text.includes(UNSUBSCRIBE_PLACEHOLDER)) return text.replaceAll(UNSUBSCRIBE_PLACEHOLDER, unsubscribeUrl);
  return `${text.trimEnd()}\n\n----------\nYou received this because you signed up for one of our events.\nUnsubscribe: ${unsubscribeUrl}`;
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * The organizer's own HTML wins, sanitised into email-safe markup, and then
 * placement is theirs to decide. Otherwise the plain body is escaped into a
 * simple document with the uploaded images stacked on the chosen side of it.
 *
 * Whatever this returns is stored on the mail task, carried verbatim by the
 * MIME text/html part, and rendered by every preview.
 */
export function compileBodyHtml(input: {
  bodyHtml?: string;
  bodyText?: string;
  contentIds: string[];
  placement?: ImagePlacement;
}): EmailHtmlResult {
  const authored = input.bodyHtml?.trim();
  if (authored) {
    const compiled = sanitizeEmailHtml(authored);
    const missing = input.contentIds.filter((contentId) => !compiled.html.includes(`cid:${contentId}`));
    if (missing.length) {
      compiled.warnings.push(
        `${missing.length === 1 ? 'One attached image is' : `${missing.length} attached images are`} not referenced by the HTML (${missing.map((id) => `cid:${id}`).join(', ')}), so ${missing.length === 1 ? 'it will not' : 'they will not'} appear in the email.`,
      );
    }
    return compiled;
  }

  if (!input.contentIds.length) return { html: plainTextToHtml(input.bodyText ?? ''), warnings: [] };

  const placement = input.placement ?? 'above';
  const pictures = input.contentIds
    .map((contentId, index) => {
      const spacing = placement === 'below'
        ? `margin:${index === 0 ? '16px' : '0'} 0 16px`
        : 'margin:0 0 16px';
      return `<img src="cid:${contentId}" alt="" width="560" style="display:block;width:560px;max-width:100%;height:auto;${spacing}" />`;
    })
    .join('');
  const text = plainTextToHtml(input.bodyText ?? '');
  const inner = placement === 'below' ? `${text}${pictures}` : `${pictures}${text}`;
  return { html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${inner}</div>`, warnings: [] };
}

/** Kept for callers that only need the markup. */
export function buildBodyHtml(
  bodyHtml: string | undefined,
  bodyText: string,
  contentIds: string[],
  placement: ImagePlacement = 'above',
): string {
  return compileBodyHtml({ bodyHtml, bodyText, contentIds, placement }).html;
}

export function plainTextToHtml(value: string): string {
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')}</div>`;
}

/**
 * Swaps every cid: reference for the inline image it points at so a browser can
 * display the same markup a mail client resolves from the MIME tree.
 */
export function resolveInlineImages(html: string, images: PreviewImage[]): string {
  if (!images.length) return html;
  const byContentId = new Map(images.map((image) => [image.contentId, image]));
  return html.replace(/cid:([a-z0-9._-]+)/gi, (full, contentId: string) => {
    const image = byContentId.get(contentId);
    if (!image) return full;
    return `data:${image.mimeType};base64,${image.dataBase64.replace(/\s/g, '')}`;
  });
}

/**
 * Wraps the stored body in the surface a mail client provides around it: a
 * white page, a default font, and tables that behave the way email tables do.
 * Rendered inside a sandboxed iframe, so no script can run either way.
 */
export function renderPreviewDocument(input: {
  bodyHtml: string;
  images?: PreviewImage[];
  subject?: string;
}): string {
  const body = resolveInlineImages(input.bodyHtml, input.images ?? []);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>${escapeHtml(input.subject ?? 'Email preview')}</title>
<style>
  html { background: #ffffff; }
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
    color: #202124;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  img { border: 0; max-width: 100%; }
  table { border-collapse: collapse; }
  a { color: #1a73e8; }
  blockquote { margin: 0 0 0 12px; padding-left: 12px; border-left: 2px solid #dadce0; }
</style>
</head>
<body>${body}</body>
</html>`;
}

/** The plain-text alternative, shown the way a text-only client would. */
export function renderPlainTextDocument(bodyText: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
    color: #202124;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12.5px;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
</head>
<body>${escapeHtml(bodyText)}</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
