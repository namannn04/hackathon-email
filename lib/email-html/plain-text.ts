import { decodeHtmlEntities } from './sanitize';

/**
 * Derives the text/plain alternative from a compiled HTML body.
 *
 * Every message is sent as multipart/alternative, so an organizer who writes
 * only HTML still needs a text part: an empty one reads as suspicious to spam
 * filters and leaves text-only clients with a blank message. This runs over the
 * already-compiled markup — a known, small tag vocabulary — rather than
 * arbitrary HTML, which is what makes a regex pass sufficient here.
 *
 * Whitespace is collapsed the way a browser collapses it, including inside
 * <pre>, so a preformatted block loses its original line breaks in this
 * fallback.
 */
export function htmlToPlainText(html: string): string {
  let text = html;

  // CSS is not content.
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  // Newlines in the source are insignificant whitespace in HTML, so they are
  // flattened first. Every newline after this point is one this function adds
  // for a real block boundary, which keeps indented markup from breaking a
  // sentence into pieces.
  text = text.replace(/[\r\n\t]+/g, ' ');

  // Keep a link's label and expose where it goes, unless they are the same.
  text = text.replace(
    /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_full, href: string, label: string) => {
      const target = decodeHtmlEntities(href).trim();
      const words = collapse(stripTags(label));
      if (!words) return target;
      if (!target || target === words || target === `mailto:${words}` || target === `tel:${words}`) return words;
      return `${words} (${target})`;
    },
  );

  // An image only carries meaning through its alt text.
  text = text.replace(/<img\b[^>]*>/gi, (tag: string) => {
    const alt = /\balt="([^"]*)"/i.exec(tag)?.[1] ?? '';
    const words = collapse(decodeHtmlEntities(alt));
    return words ? `[${words}]` : '';
  });

  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<hr\s*\/?>/gi, '\n\n----------\n\n');

  // A row stays on one line with its cells separated, so a schedule table is
  // still readable. Only the row's end breaks the line.
  text = text.replace(/<\/(td|th)>\s*(?=<(td|th)\b)/gi, ' | ');
  text = text.replace(/<\/?(td|th)\b[^>]*>/gi, '');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<tr\b[^>]*>/gi, '');

  // A list item opens its own line; its close would only add a blank one.
  // Leading whitespace is swallowed so indented markup does not double-space.
  text = text.replace(/\s*<li\b[^>]*>/gi, '\n- ');
  text = text.replace(/<\/li>/gi, '');

  // Every other block boundary becomes a line break.
  const BLOCKS = 'p|div|h[1-6]|table|thead|tbody|tfoot|blockquote|pre|ul|ol|dl|dt|dd'
    + '|section|article|header|footer|main|aside|nav|figure|figcaption|address|center|caption';
  text = text.replace(new RegExp(`</(${BLOCKS})>`, 'gi'), '\n');
  text = text.replace(new RegExp(`<(${BLOCKS})\\b[^>]*>`, 'gi'), '\n');

  text = stripTags(text);
  text = decodeHtmlEntities(text);

  return text
    .split('\n')
    // A cell separator can be orphaned when a cell holds block content, which
    // pushes its text onto its own line.
    .map((line) => collapse(line).replace(/^\|\s*/, '').replace(/\s*\|$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

/** Collapses runs of whitespace, as HTML rendering does. */
function collapse(value: string): string {
  return value.replace(/[^\S\n]+/g, ' ').trim();
}
