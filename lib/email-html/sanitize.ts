/**
 * Compiles organizer-authored HTML into the exact markup that is placed in the
 * outgoing message. Email clients silently discard whatever they dislike, so
 * this pass decides up front which tags, attributes and CSS properties survive,
 * and reports everything it changed. The stored result is what the MIME body
 * carries and what every preview renders, so a preview cannot drift from the
 * real email.
 *
 * Pure and isomorphic on purpose: the compose screen runs it in the browser for
 * a live preview and the API runs it on the server before persisting.
 */

export type EmailHtmlResult = {
  html: string;
  warnings: string[];
};

const MAX_OUTPUT_LENGTH = 400_000;
const MAX_NESTING_DEPTH = 64;
const MAX_TOKENS = 20_000;

const GLOBAL_ATTRS = ['style', 'title', 'dir', 'lang', 'class', 'id'];

/** Tag allowlist with the attributes each one keeps on top of GLOBAL_ATTRS. */
const ALLOWED_TAGS: Record<string, readonly string[]> = {
  // Block flow
  div: ['align'],
  p: ['align'],
  span: [],
  br: ['clear'],
  hr: ['align', 'width', 'size', 'noshade', 'color'],
  h1: ['align'], h2: ['align'], h3: ['align'], h4: ['align'], h5: ['align'], h6: ['align'],
  blockquote: ['cite'],
  pre: [],
  address: [],
  center: [],
  article: [], section: [], header: [], footer: [], main: [], aside: [], nav: [],
  figure: [], figcaption: [],
  details: ['open'], summary: [],

  // Inline
  a: ['href', 'target', 'rel', 'name'],
  strong: [], b: [], em: [], i: [], u: [], s: [], strike: [], del: ['cite'], ins: ['cite'],
  small: [], big: [], sub: [], sup: [], mark: [], code: [], kbd: [], samp: [], var: [], tt: [],
  abbr: [], cite: [], q: ['cite'], time: ['datetime'], bdi: [], bdo: [], wbr: [],
  font: ['color', 'face', 'size'],
  label: [],

  // Lists
  ul: ['type'], ol: ['type', 'start', 'reversed'], li: ['value', 'type'],
  dl: [], dt: [], dd: [],

  // Tables, still the backbone of email layout
  table: ['width', 'height', 'align', 'bgcolor', 'background', 'border', 'cellpadding', 'cellspacing', 'role', 'summary'],
  thead: ['align', 'valign', 'bgcolor'],
  tbody: ['align', 'valign', 'bgcolor'],
  tfoot: ['align', 'valign', 'bgcolor'],
  tr: ['align', 'valign', 'bgcolor', 'height'],
  td: ['align', 'valign', 'bgcolor', 'background', 'width', 'height', 'colspan', 'rowspan', 'nowrap', 'scope'],
  th: ['align', 'valign', 'bgcolor', 'background', 'width', 'height', 'colspan', 'rowspan', 'nowrap', 'scope'],
  caption: ['align'],
  colgroup: ['span', 'width', 'align'],
  col: ['span', 'width', 'align', 'valign', 'bgcolor'],

  // Media
  img: ['src', 'alt', 'width', 'height', 'align', 'border', 'hspace', 'vspace'],
};

/**
 * Every HTML element that never has a closing tag. This is deliberately the
 * full list rather than just the allowed ones: a blocked void element such as
 * <meta> or <link> must not start a "skip until the close tag" subtree, because
 * that close tag never arrives and the rest of the document would be dropped.
 */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'basefont', 'bgsound', 'br', 'col', 'embed', 'frame', 'hr', 'img',
  'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Consumed as literal text up to the matching close tag, never re-parsed. */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'title', 'textarea', 'noscript', 'iframe', 'xmp', 'plaintext']);

/** Dropped together with everything inside them. */
const BLOCKED_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select', 'option',
  'optgroup', 'textarea', 'fieldset', 'legend', 'link', 'meta', 'base', 'svg', 'math', 'video',
  'audio', 'source', 'track', 'canvas', 'frame', 'frameset', 'noframes', 'noscript', 'title',
  'template', 'slot', 'portal', 'xmp', 'plaintext', 'marquee',
]);

/** Structural wrappers with nothing to contribute to a message body. */
const UNWRAPPED_TAGS = new Set(['html', 'head', 'body']);

/** Tags whose open tag implicitly closes an open sibling. */
const IMPLIED_CLOSERS: Record<string, readonly string[]> = {
  li: ['li'],
  tr: ['tr', 'td', 'th'],
  td: ['td', 'th'],
  th: ['td', 'th'],
  dt: ['dt', 'dd'],
  dd: ['dt', 'dd'],
  thead: ['td', 'th', 'tr'],
  tbody: ['td', 'th', 'tr'],
  tfoot: ['td', 'th', 'tr'],
};

/** Blocks that cannot legally sit inside an open paragraph. */
const CLOSES_PARAGRAPH = new Set([
  'p', 'div', 'table', 'ul', 'ol', 'dl', 'blockquote', 'pre', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'address', 'center',
]);

const ALLOWED_STYLE_PROPS = new Set([
  'color', 'opacity', 'visibility', 'display', 'float', 'clear', 'cursor', 'outline', 'outline-color',
  'outline-style', 'outline-width', 'box-sizing', 'box-shadow', 'border-radius', 'border-collapse',
  'border-spacing', 'table-layout', 'caption-side', 'empty-cells', 'direction', 'unicode-bidi',
  'vertical-align', 'text-align', 'text-align-last', 'text-decoration', 'text-decoration-color',
  'text-decoration-line', 'text-decoration-style', 'text-decoration-thickness', 'text-transform',
  'text-indent', 'text-shadow', 'text-overflow', 'white-space', 'word-break', 'word-wrap',
  'overflow-wrap', 'word-spacing', 'letter-spacing', 'line-height', 'list-style', 'list-style-type',
  'list-style-position', 'list-style-image', 'width', 'min-width', 'max-width', 'height', 'min-height',
  'max-height', 'overflow', 'overflow-x', 'overflow-y', 'aspect-ratio', 'object-fit', 'object-position',
  // Flex and grid render faithfully in the preview; client support varies.
  'flex', 'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-wrap',
  'align-items', 'align-content', 'align-self', 'justify-content', 'justify-items', 'justify-self',
  'gap', 'row-gap', 'column-gap', 'order', 'grid', 'grid-area', 'grid-auto-columns', 'grid-auto-flow',
  'grid-auto-rows', 'grid-column', 'grid-column-end', 'grid-column-start', 'grid-row', 'grid-row-end',
  'grid-row-start', 'grid-template', 'grid-template-areas', 'grid-template-columns', 'grid-template-rows',
]);

/** Property families kept whole so every longhand comes along. */
const ALLOWED_STYLE_PREFIXES = [
  'font', 'background', 'border', 'margin', 'padding', 'mso-',
  '-webkit-text-size-adjust', '-ms-text-size-adjust',
];

const BLOCKED_STYLE_PROPS = new Set([
  'position', 'behavior', '-moz-binding', 'filter', 'zoom', 'content', 'z-index', 'transition', 'animation',
]);

const URL_ATTRS = new Set(['href', 'src', 'background', 'cite', 'longdesc']);
const SAFE_URL_SCHEMES = new Set(['https', 'http', 'mailto', 'tel', 'cid']);
const SAFE_DATA_URL = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

type Warner = (message: string) => void;

export function sanitizeEmailHtml(input: string): EmailHtmlResult {
  const seen = new Set<string>();
  const warnings: string[] = [];
  const warn: Warner = (message) => {
    if (seen.has(message) || warnings.length >= 40) return;
    seen.add(message);
    warnings.push(message);
  };

  const out: string[] = [];
  const stack: string[] = [];
  // While a blocked element is open, every token inside it is discarded.
  let blocked: { tag: string; depth: number } | null = null;
  let index = 0;
  let truncated = false;
  // A <div> emitted in place of <body style="..."> so the document's own font
  // and background survive; <body> itself cannot appear in a message body.
  let bodyWrapper = false;

  const closeThrough = (tag: string) => {
    const at = stack.lastIndexOf(tag);
    if (at < 0) return false;
    for (let level = stack.length - 1; level >= at; level -= 1) {
      if (level > at) warn(`<${stack[level]}> was left open and was closed automatically.`);
      out.push(`</${stack[level]}>`);
    }
    stack.length = at;
    return true;
  };

  while (index < input.length) {
    const lt = input.indexOf('<', index);
    if (lt < 0) {
      if (!blocked) out.push(encodeText(input.slice(index)));
      break;
    }
    if (lt > index && !blocked) out.push(encodeText(input.slice(index, lt)));

    if (input.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4);
      index = end < 0 ? input.length : end + 3;
      continue;
    }
    if (input.startsWith('<!', lt) || input.startsWith('<?', lt)) {
      const end = input.indexOf('>', lt);
      index = end < 0 ? input.length : end + 1;
      continue;
    }

    const parsed = parseTag(input, lt);
    if (!parsed) {
      // A stray "<" is content, not markup.
      if (!blocked) out.push('&lt;');
      index = lt + 1;
      continue;
    }
    index = parsed.next;
    const { tag, closing, attrs, selfClosing } = parsed;

    if (blocked) {
      if (tag === blocked.tag) {
        if (closing) {
          blocked.depth -= 1;
          if (blocked.depth <= 0) blocked = null;
        } else if (!selfClosing && !VOID_ELEMENTS.has(tag)) {
          blocked.depth += 1;
        }
      }
      continue;
    }

    if (closing) {
      if (UNWRAPPED_TAGS.has(tag) || BLOCKED_TAGS.has(tag)) continue;
      if (!ALLOWED_TAGS[tag]) {
        warn(`<${tag}> is not supported in email and was removed (its content was kept).`);
        continue;
      }
      if (VOID_ELEMENTS.has(tag)) continue;
      closeThrough(tag);
      continue;
    }

    if (RAW_TEXT_TAGS.has(tag)) {
      const raw = readRawText(input, index, tag);
      index = raw.next;
      if (tag === 'style') {
        const css = sanitizeCss(raw.text, warn);
        if (css) {
          out.push(`<style type="text/css">${css}</style>`);
          warn('The <style> block was kept, but Gmail and Outlook often ignore it — inline styles are more reliable.');
        }
      } else {
        warn(`<${tag}> was removed because email clients block it.`);
      }
      continue;
    }

    if (BLOCKED_TAGS.has(tag)) {
      const opensSubtree = !selfClosing && !VOID_ELEMENTS.has(tag);
      warn(opensSubtree
        ? `<${tag}> was removed, along with everything inside it, because email clients block it.`
        : `<${tag}> was removed because email clients block it.`);
      if (opensSubtree) blocked = { tag, depth: 1 };
      continue;
    }

    if (UNWRAPPED_TAGS.has(tag)) {
      if (tag === 'body' && !bodyWrapper && !stack.length) {
        const style = sanitizeStyle(readAttribute(attrs, 'style'), 'body', warn);
        if (style) {
          out.push(`<div style="${encodeAttribute(style)}">`);
          stack.push('div');
          bodyWrapper = true;
        }
      }
      continue;
    }

    if (!ALLOWED_TAGS[tag]) {
      warn(`<${tag}> is not supported in email and was removed (its content was kept).`);
      continue;
    }

    for (const open of IMPLIED_CLOSERS[tag] ?? []) {
      if (stack[stack.length - 1] === open) closeThrough(open);
    }
    if (CLOSES_PARAGRAPH.has(tag) && stack[stack.length - 1] === 'p') closeThrough('p');

    if (!VOID_ELEMENTS.has(tag) && stack.length >= MAX_NESTING_DEPTH) {
      warn('The markup was nested too deeply, so the deepest tags were removed.');
      continue;
    }

    const rendered = renderAttributes(tag, attrs, warn);
    if (VOID_ELEMENTS.has(tag)) {
      out.push(`<${tag}${rendered} />`);
    } else {
      out.push(`<${tag}${rendered}>`);
      stack.push(tag);
    }

    if (out.length > MAX_TOKENS) {
      truncated = true;
      break;
    }
  }

  if (!truncated) {
    for (const [level, tag] of stack.entries()) {
      if (bodyWrapper && level === 0) continue;
      warn(`<${tag}> was left open and was closed automatically.`);
    }
  }
  for (let level = stack.length - 1; level >= 0; level -= 1) out.push(`</${stack[level]}>`);

  let html = out.join('');
  if (html.length > MAX_OUTPUT_LENGTH) {
    html = html.slice(0, MAX_OUTPUT_LENGTH);
    truncated = true;
  }
  if (truncated) warn('The markup was larger than one email can carry and was truncated.');
  return { html, warnings };
}

type ParsedTag = {
  tag: string;
  closing: boolean;
  attrs: string;
  selfClosing: boolean;
  next: number;
};

function parseTag(input: string, start: number): ParsedTag | null {
  const head = /^<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)/.exec(input.slice(start, start + 96));
  if (!head) return null;
  const closing = head[1] === '/';
  const tag = head[2].toLowerCase().replace(/^[a-z]+:/, '');
  let cursor = start + head[0].length;
  let quote = '';
  while (cursor < input.length) {
    const char = input[cursor];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      break;
    }
    cursor += 1;
  }
  const attrs = input.slice(start + head[0].length, cursor);
  return {
    tag,
    closing,
    attrs,
    selfClosing: /\/\s*$/.test(attrs),
    next: cursor < input.length ? cursor + 1 : input.length,
  };
}

function readRawText(input: string, from: number, tag: string): { text: string; next: number } {
  const closer = new RegExp(`</\\s*${tag}\\s*>`, 'i');
  const rest = input.slice(from);
  const match = closer.exec(rest);
  if (!match) return { text: rest, next: input.length };
  return { text: rest.slice(0, match.index), next: from + match.index + match[0].length };
}

const ATTR_PATTERN = /([a-zA-Z_:@][a-zA-Z0-9_:.\-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function readAttribute(source: string, wanted: string): string {
  ATTR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_PATTERN.exec(source))) {
    if (match[1].toLowerCase() === wanted) return match[2] ?? match[3] ?? match[4] ?? '';
  }
  return '';
}

function renderAttributes(tag: string, source: string, warn: Warner): string {
  const allowed = new Set([...GLOBAL_ATTRS, ...(ALLOWED_TAGS[tag] ?? [])]);
  const pieces: string[] = [];
  const used = new Set<string>();
  let hasSizing = false;
  let hasHref = false;

  ATTR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_PATTERN.exec(source))) {
    const name = match[1].toLowerCase();
    const raw = match[2] ?? match[3] ?? match[4] ?? '';
    if (used.has(name)) continue;
    used.add(name);

    if (name.startsWith('on')) {
      warn(`The ${name} handler was removed from <${tag}> — email cannot run scripts.`);
      continue;
    }
    if (!allowed.has(name)) {
      warn(`The ${name} attribute is not supported on <${tag}> and was removed.`);
      continue;
    }

    if (name === 'style') {
      const style = sanitizeStyle(raw, tag, warn);
      if (!style) continue;
      if (/(^|;)\s*(width|max-width|height)\s*:/i.test(style)) hasSizing = true;
      pieces.push(`style="${encodeAttribute(style)}"`);
      continue;
    }

    if (URL_ATTRS.has(name)) {
      const url = safeUrl(raw);
      if (!url) {
        warn(`A ${name} value on <${tag}> was removed — only https, mailto, tel, cid and inline image URLs are allowed.`);
        continue;
      }
      if (name === 'href') hasHref = true;
      pieces.push(`${name}="${encodeAttribute(url)}"`);
      continue;
    }

    if (name === 'target') {
      pieces.push('target="_blank"');
      continue;
    }

    if (name === 'width' || name === 'height') hasSizing = true;
    pieces.push(raw === '' ? name : `${name}="${encodeAttribute(raw)}"`);
  }

  // An unconstrained image overflows narrow mail apps, so give it a ceiling.
  if (tag === 'img' && !hasSizing) {
    pieces.push('style="max-width:100%;height:auto"');
    warn('An <img> without a width was capped at max-width:100% so it fits narrow screens.');
  }
  if (tag === 'img' && !used.has('alt')) pieces.push('alt=""');
  if (tag === 'a' && hasHref && !used.has('target')) pieces.push('target="_blank"');
  if (tag === 'a' && hasHref && !used.has('rel')) pieces.push('rel="noopener noreferrer"');

  return pieces.length ? ` ${pieces.join(' ')}` : '';
}

function sanitizeStyle(source: string, tag: string, warn: Warner): string {
  const kept: string[] = [];
  for (const declaration of splitDeclarations(decodeEntities(source))) {
    const colon = declaration.indexOf(':');
    if (colon < 1) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (!property || !value) continue;

    if (BLOCKED_STYLE_PROPS.has(property)) {
      warn(`The CSS property ${property} was removed from <${tag}> because email clients reject it.`);
      continue;
    }
    if (!isAllowedStyleProperty(property)) {
      warn(`The CSS property ${property} is not supported in email and was removed.`);
      continue;
    }
    if (/expression\s*\(|javascript:|vbscript:|[<>]|\\/i.test(value)) {
      warn(`An unsafe value for ${property} was removed.`);
      continue;
    }
    if (/url\s*\(/i.test(value) && !hasSafeCssUrls(value)) {
      warn(`A url() in ${property} was removed — only https, cid and inline image URLs are allowed.`);
      continue;
    }
    kept.push(`${property}:${value}`);
  }
  return kept.join(';');
}

function isAllowedStyleProperty(property: string): boolean {
  if (ALLOWED_STYLE_PROPS.has(property)) return true;
  return ALLOWED_STYLE_PREFIXES.some((prefix) => (
    property === prefix || property.startsWith(prefix.endsWith('-') ? prefix : `${prefix}-`)
  ));
}

function hasSafeCssUrls(value: string): boolean {
  const urls = value.match(/url\s*\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)/gi) ?? [];
  return urls.every((entry) => {
    const inner = entry
      .replace(/^url\s*\(\s*/i, '')
      .replace(/\s*\)$/, '')
      .replace(/^["']|["']$/g, '');
    return Boolean(safeUrl(inner));
  });
}

/** Split on ";" while ignoring separators inside quotes or url(). */
function splitDeclarations(source: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote = '';
  let depth = 0;
  for (const char of source) {
    if (quote) {
      if (char === quote) quote = '';
      current += char;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; current += char; continue; }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ';' && depth === 0) { parts.push(current); current = ''; continue; }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function sanitizeCss(source: string, warn: Warner): string {
  // Angle brackets could end the <style> element early, and @import pulls in
  // remote CSS that no mail client will fetch anyway.
  let css = source.replace(/[<>]/g, '');
  if (/@import/i.test(css)) {
    warn('An @import rule was removed from the <style> block.');
    css = css.replace(/@import[^;]*;?/gi, '');
  }
  if (/expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding/i.test(css)) {
    warn('Unsafe declarations were removed from the <style> block.');
    css = css
      .replace(/expression\s*\([^)]*\)/gi, '')
      .replace(/(javascript|vbscript):/gi, '')
      .replace(/behavior\s*:[^;}]*/gi, '')
      .replace(/-moz-binding\s*:[^;}]*/gi, '');
  }
  return css.trim().slice(0, 40_000);
}

export function safeUrl(value: string): string | null {
  // Control characters and entity escapes are how "java&#9;script:" hides.
  const decoded = decodeEntities(value)
    .replace(/[\u0000-\u0020\u007f-\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f-\u2064\u3000\ufeff]/g, '')
    .trim();
  if (!decoded) return null;
  if (SAFE_DATA_URL.test(value.trim())) return value.trim().replace(/\s+/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(decoded);
  if (!scheme) return null;
  return SAFE_URL_SCHEMES.has(scheme[1].toLowerCase()) ? value.trim() : null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', tab: '\t', newline: '\n',
  // Typographic entities, for turning a compiled body back into readable text.
  hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', lsquo: '\u2018', rsquo: '\u2019',
  ldquo: '\u201c', rdquo: '\u201d', bull: '\u2022', middot: '\u00b7', copy: '\u00a9',
  reg: '\u00ae', trade: '\u2122', deg: '\u00b0', laquo: '\u00ab', raquo: '\u00bb',
  times: '\u00d7', divide: '\u00f7', plusmn: '\u00b1', euro: '\u20ac', pound: '\u00a3',
  yen: '\u00a5', cent: '\u00a2', sect: '\u00a7', para: '\u00b6', dagger: '\u2020',
  rarr: '\u2192', larr: '\u2190', frac12: '\u00bd', frac14: '\u00bc', frac34: '\u00be',
  ensp: ' ', emsp: ' ', thinsp: ' ', shy: '',
};

export function decodeHtmlEntities(value: string): string {
  return decodeEntities(value);
}

function decodeEntities(value: string): string {
  return value.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});?/g, (full, body: string) => {
    if (body.startsWith('#')) {
      const digits = body.slice(1);
      const code = digits[0] === 'x' || digits[0] === 'X'
        ? Number.parseInt(digits.slice(1), 16)
        : Number.parseInt(digits, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? full;
  });
}

/** Keeps author-written entities intact while neutralising bare markup. */
function encodeText(value: string): string {
  return value.replace(/[&<>]/g, (char, offset: number) => {
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    return isEntityStart(value, offset) ? '&' : '&amp;';
  });
}

function encodeAttribute(value: string): string {
  return value.replace(/[&<>"]/g, (char, offset: number) => {
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return isEntityStart(value, offset) ? '&' : '&amp;';
  });
}

function isEntityStart(value: string, offset: number): boolean {
  return /^&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/.test(value.slice(offset, offset + 34));
}

/** Powers the "what can I use" reference on the compose screen. */
export const EMAIL_HTML_SUPPORT = {
  tags: Object.keys(ALLOWED_TAGS).sort(),
  globalAttributes: [...GLOBAL_ATTRS].sort(),
  tagAttributes: ALLOWED_TAGS,
};
