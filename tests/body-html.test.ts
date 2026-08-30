import { describe, expect, it } from 'vitest';
import { buildBodyHtml } from '@/lib/mail-tasks/manage';

describe('mail task HTML body', () => {
  it('stacks images above the text by default', () => {
    const html = buildBodyHtml(undefined, 'Hello team', ['image1', 'image2']);
    expect(html.indexOf('cid:image1')).toBeLessThan(html.indexOf('cid:image2'));
    expect(html.indexOf('cid:image2')).toBeLessThan(html.indexOf('Hello team'));
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

  it('uses the authored HTML verbatim and ignores placement', () => {
    const authored = '<p>Custom <img src="cid:image1"> layout</p>';
    expect(buildBodyHtml(authored, 'ignored', ['image1'], 'below')).toBe(authored);
    expect(buildBodyHtml(`  ${authored}  `, 'ignored', ['image1'])).toBe(authored);
  });

  it('falls back to the plain document when there are no images', () => {
    const html = buildBodyHtml(undefined, 'Hello team', [], 'below');
    expect(html).toContain('Hello team');
    expect(html).not.toContain('<img');
  });
});
