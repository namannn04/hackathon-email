import { describe, expect, it } from 'vitest';
import { sanitizeEmailHtml } from '@/lib/email-html/sanitize';
import { renderPreviewDocument, resolveInlineImages } from '@/lib/email-html/document';

describe('email HTML compiler', () => {
  it('keeps the tags email layouts are built from, with their attributes', () => {
    const { html } = sanitizeEmailHtml(
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">'
      + '<tr><td align="center" valign="top" colspan="2" style="padding:16px 24px;font-size:15px">'
      + '<h2 align="center">Hello</h2><p>Line <strong>one</strong> and <em>two</em></p>'
      + '<ul><li>First</li><li>Second</li></ul></td></tr></table>',
    );
    expect(html).toContain('<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">');
    expect(html).toContain('<td align="center" valign="top" colspan="2" style="padding:16px 24px;font-size:15px">');
    expect(html).toContain('<h2 align="center">');
    expect(html).toContain('<li>First</li>');
    expect(html).toContain('</table>');
  });

  it('removes scripts together with everything inside them', () => {
    const { html, warnings } = sanitizeEmailHtml('<p>Before</p><script>alert(document.cookie)</script><p>After</p>');
    expect(html).toBe('<p>Before</p><p>After</p>');
    expect(html).not.toContain('alert');
    expect(warnings).toContain('<script> was removed because email clients block it.');
  });

  it('drops event handlers but keeps the element', () => {
    const { html, warnings } = sanitizeEmailHtml('<div onclick="steal()" style="color:#333">Text</div>');
    expect(html).toBe('<div style="color:#333">Text</div>');
    expect(warnings).toContain('The onclick handler was removed from <div> — email cannot run scripts.');
  });

  it('refuses script URLs, including entity-obfuscated ones', () => {
    expect(sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>').html).toBe('<a>x</a>');
    expect(sanitizeEmailHtml('<a href="java&#9;script:alert(1)">x</a>').html).toBe('<a>x</a>');
    expect(sanitizeEmailHtml('<img src="data:text/html;base64,AAA">').html).not.toContain('src=');
  });

  it('keeps the URL schemes an email can actually use', () => {
    const { html } = sanitizeEmailHtml('<a href="https://example.com/a?b=1&c=2">link</a><a href="mailto:a@b.co">mail</a><img src="cid:image1">');
    expect(html).toContain('href="https://example.com/a?b=1&amp;c=2"');
    expect(html).toContain('href="mailto:a@b.co"');
    expect(html).toContain('src="cid:image1"');
  });

  it('adds target and rel to links so inbox clicks leave the mail app safely', () => {
    const { html } = sanitizeEmailHtml('<a href="https://example.com">x</a>');
    expect(html).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>');
  });

  it('filters CSS declarations instead of the whole style attribute', () => {
    const { html, warnings } = sanitizeEmailHtml('<div style="color:red;position:fixed;padding:8px;behavior:url(x.htc)">a</div>');
    expect(html).toBe('<div style="color:red;padding:8px">a</div>');
    expect(warnings.some((warning) => warning.includes('position'))).toBe(true);
  });

  it('allows image url() only from schemes an inbox can resolve', () => {
    expect(sanitizeEmailHtml('<td style="background-image:url(https://cdn.example.com/a.png)">x</td>').html)
      .toContain('background-image:url(https://cdn.example.com/a.png)');
    expect(sanitizeEmailHtml('<td style="background-image:url(javascript:alert(1))">x</td>').html)
      .toBe('<td>x</td>');
  });

  it('closes tags the author left open and discards stray close tags', () => {
    const { html, warnings } = sanitizeEmailHtml('<div><p>Hi</div></span>');
    expect(html).toBe('<div><p>Hi</p></div>');
    expect(warnings.some((warning) => warning.includes('left open'))).toBe(true);
  });

  it('unwraps document scaffolding but keeps the content inside it', () => {
    const { html } = sanitizeEmailHtml('<html><head><title>t</title></head><body><p>Body</p></body></html>');
    expect(html).toBe('<p>Body</p>');
  });

  it('keeps an embedded style block but strips what could escape it', () => {
    const { html } = sanitizeEmailHtml('<style>@import url(evil.css); .a { color: red } </style><p class="a">x</p>');
    expect(html).toContain('<style type="text/css">');
    expect(html).toContain('.a { color: red }');
    expect(html).not.toContain('@import');
    expect(html).toContain('<p class="a">x</p>');
  });

  it('caps an unsized image so it cannot overflow a phone', () => {
    expect(sanitizeEmailHtml('<img src="cid:image1">').html)
      .toBe('<img src="cid:image1" style="max-width:100%;height:auto" alt="" />');
    expect(sanitizeEmailHtml('<img src="cid:image1" width="560" alt="Logo">').html)
      .toBe('<img src="cid:image1" width="560" alt="Logo" />');
  });

  it('escapes stray markup characters in text without mangling entities', () => {
    const { html } = sanitizeEmailHtml('<p>5 &lt; 7 &amp;&amp; a &gt; b, Tom & Jerry, 3 < 4</p>');
    expect(html).toBe('<p>5 &lt; 7 &amp;&amp; a &gt; b, Tom &amp; Jerry, 3 &lt; 4</p>');
  });

  it('closes an open list item or row when the next one starts', () => {
    expect(sanitizeEmailHtml('<ul><li>a<li>b</ul>').html).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(sanitizeEmailHtml('<table><tr><td>a<td>b</table>').html)
      .toBe('<table><tr><td>a</td><td>b</td></tr></table>');
  });

  it('keeps the document when a blocked void element has no closing tag', () => {
    // <meta> never closes, so treating it as a container swallowed the whole email.
    const { html } = sanitizeEmailHtml('<meta charset="UTF-8"><p>Body survives</p>');
    expect(html).toBe('<p>Body survives</p>');
  });

  it.each(['meta', 'link', 'input', 'base', 'source', 'track', 'embed', 'area'])(
    'does not let a blocked <%s> swallow what follows it',
    (tag) => {
      const { html } = sanitizeEmailHtml(`<${tag} name="x"><p>Kept</p>`);
      expect(html).toBe('<p>Kept</p>');
    },
  );

  it('unwraps a full document and keeps only the body content', () => {
    const { html } = sanitizeEmailHtml(
      '<!doctype html><html lang="en"><head><meta charset="UTF-8">'
      + '<title>Subject line</title></head><body><table><tr><td>Cell</td></tr></table></body></html>',
    );
    expect(html).toBe('<table><tr><td>Cell</td></tr></table>');
    expect(html).not.toContain('Subject line');
  });

  it('carries the body’s own font and background over to a wrapper div', () => {
    const { html } = sanitizeEmailHtml(
      '<body style="background-color:#f3f4f8;font-family:Arial, Helvetica, sans-serif"><p>Hi</p></body>',
    );
    expect(html).toBe(
      '<div style="background-color:#f3f4f8;font-family:Arial, Helvetica, sans-serif"><p>Hi</p></div>',
    );
  });

  it('does not warn about the wrapper it added itself', () => {
    const { warnings } = sanitizeEmailHtml('<body style="color:#111"><p>Hi</p></body>');
    expect(warnings.some((warning) => warning.includes('left open'))).toBe(false);
  });

  it('adds no wrapper when the body carries no usable style', () => {
    expect(sanitizeEmailHtml('<body><p>Hi</p></body>').html).toBe('<p>Hi</p>');
    expect(sanitizeEmailHtml('<body style="position:fixed"><p>Hi</p></body>').html).toBe('<p>Hi</p>');
  });

  it('says so when a blocked container takes its content with it', () => {
    const { warnings } = sanitizeEmailHtml('<form><p>Gone</p></form>');
    expect(warnings).toContain('<form> was removed, along with everything inside it, because email clients block it.');
  });

  it('reports blocked interactive elements rather than sending them', () => {
    const { html, warnings } = sanitizeEmailHtml('<form action="/x"><input name="a"><button>Go</button></form><p>Keep</p>');
    expect(html).toBe('<p>Keep</p>');
    expect(warnings).toContain('<form> was removed, along with everything inside it, because email clients block it.');
  });
});

describe('email preview document', () => {
  it('resolves each cid reference to the inline image it points at', () => {
    const html = resolveInlineImages('<img src="cid:image1"><img src="cid:image9">', [
      { contentId: 'image1', mimeType: 'image/png', dataBase64: 'AAAB' },
    ]);
    expect(html).toContain('src="data:image/png;base64,AAAB"');
    expect(html).toContain('src="cid:image9"');
  });

  it('renders the stored body verbatim inside the preview document', () => {
    const body = '<p style="color:#123456">Exactly this</p>';
    const document = renderPreviewDocument({ bodyHtml: body, subject: 'Set <1>' });
    expect(document).toContain(`<body>${body}</body>`);
    expect(document).toContain('<title>Set &lt;1&gt;</title>');
  });
});
