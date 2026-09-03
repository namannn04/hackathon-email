import { describe, expect, it } from 'vitest';
import { buildBodyHtml, compileBodyHtml } from '@/lib/email-html/document';

describe('mail task HTML body', () => {
  it('stacks images above the text by default', () => {
    const html = buildBodyHtml(undefined, 'Hello team', ['image1', 'image2']);
    expect(html.indexOf('cid:image1')).toBeLessThan(html.indexOf('cid:image2'));
    expect(html.indexOf('cid:image2')).toBeLessThan(html.indexOf('Hello team'));
    expect(html).toContain('width="560"');
    expect(html).toContain('width:560px;max-width:100%;height:auto');
  });

  it('stacks images below the text when asked', () => {
    const html = buildBodyHtml(undefined, 'Hello team', ['image1', 'image2'], 'below');
    expect(html.indexOf('Hello team')).toBeLessThan(html.indexOf('cid:image1'));
    expect(html.indexOf('cid:image1')).toBeLessThan(html.indexOf('cid:image2'));
  });

  it('escapes the plain body so typed markup cannot become real tags', () => {
    const html = buildBodyHtml(undefined, 'Hi <b>there</b> & <img src="x">', []);
    expect(html).toContain('&lt;b&gt;there&lt;/b&gt; &amp; &lt;img');
    expect(html).not.toContain('<b>there</b>');
  });

  it('compiles the authored HTML and ignores placement', () => {
    const authored = '<p>Custom <img src="cid:image1" width="560"> layout</p>';
    const compiled = '<p>Custom <img src="cid:image1" width="560" alt="" /> layout</p>';
    expect(buildBodyHtml(authored, 'ignored', ['image1'], 'below')).toBe(compiled);
    expect(buildBodyHtml(`  ${authored}  `, 'ignored', ['image1'])).toBe(compiled);
  });

  it('reports an attached image the authored HTML never places', () => {
    const { warnings } = compileBodyHtml({
      bodyHtml: '<p>No picture here</p>',
      bodyText: 'ignored',
      contentIds: ['image1'],
    });
    expect(warnings.some((warning) => warning.includes('cid:image1'))).toBe(true);
  });

  it('falls back to the plain document when there are no images', () => {
    const html = buildBodyHtml(undefined, 'Hello team', [], 'below');
    expect(html).toContain('Hello team');
    expect(html).not.toContain('<img');
  });

  it('caps display width without changing the original image aspect ratio', () => {
    const html = buildBodyHtml(undefined, 'Hello team', ['image1']);
    expect(html).toContain('width="560"');
    expect(html).toContain('height:auto');
    expect(html).not.toMatch(/height="\d+"/);
  });
});
