import { describe, expect, it } from 'vitest';
import { compileEmailBody } from '@/lib/email-html/document';
import { htmlToPlainText } from '@/lib/email-html/plain-text';

describe('plain-text derivation', () => {
  it('turns block structure into line breaks', () => {
    expect(htmlToPlainText('<h1>Title</h1><p>First line</p><p>Second line</p>'))
      .toBe('Title\n\nFirst line\n\nSecond line');
  });

  it('keeps a link label and shows where it goes', () => {
    expect(htmlToPlainText('<p>Check the <a href="https://example.com/x">schedule</a> now</p>'))
      .toBe('Check the schedule (https://example.com/x) now');
  });

  it('does not repeat a link whose label already is the destination', () => {
    expect(htmlToPlainText('<a href="https://example.com">https://example.com</a>')).toBe('https://example.com');
    expect(htmlToPlainText('<a href="mailto:a@b.co">a@b.co</a>')).toBe('a@b.co');
  });

  it('writes list items as dashes', () => {
    expect(htmlToPlainText('<ul><li>Doors at 9</li><li>Bring an ID</li></ul>'))
      .toBe('- Doors at 9\n- Bring an ID');
  });

  it('keeps a table row on one line with separated cells', () => {
    expect(htmlToPlainText('<table><tr><td>Day</td><td>Time</td></tr><tr><td>Sat</td><td>9 AM</td></tr></table>'))
      .toBe('Day | Time\nSat | 9 AM');
  });

  it('drops a cell separator orphaned by block content inside a cell', () => {
    const html = '<table><tr><td><div>GEEK ROOM</div></td><td>HACKATHON UPDATE</td></tr></table>';
    expect(htmlToPlainText(html)).toBe('GEEK ROOM\nHACKATHON UPDATE');
  });

  it('represents an image by its alt text and drops a decorative one', () => {
    expect(htmlToPlainText('<p><img src="cid:image1" alt="Event banner"> Welcome</p>'))
      .toBe('[Event banner] Welcome');
    expect(htmlToPlainText('<p><img src="cid:image1" alt=""> Welcome</p>')).toBe('Welcome');
  });

  it('decodes entities and drops embedded CSS', () => {
    expect(htmlToPlainText('<style>.a{color:red}</style><p>Tom &amp; Jerry &hellip; 5 &lt; 7</p>'))
      .toBe('Tom & Jerry … 5 < 7');
  });

  it('collapses whitespace and blank runs the way a browser would', () => {
    expect(htmlToPlainText('<p>  spaced    out  </p>\n\n\n<p>next</p>')).toBe('spaced out\n\nnext');
  });

  it('does not break a sentence where the markup was indented', () => {
    const html = '<p>\n  Check the\n  <a href="https://example.com/s">schedule</a>\n  for details.\n</p>';
    expect(htmlToPlainText(html)).toBe('Check the schedule (https://example.com/s) for details.');
  });

  it('does not double-space list items written across lines', () => {
    const html = '<ul>\n  <li>Doors at 9</li>\n  <li>Bring an ID</li>\n</ul>';
    expect(htmlToPlainText(html)).toBe('- Doors at 9\n- Bring an ID');
  });

  it('renders a horizontal rule as a separator', () => {
    expect(htmlToPlainText('<p>Above</p><hr><p>Below</p>')).toBe('Above\n\n----------\n\nBelow');
  });
});

describe('compiling both body parts', () => {
  it('derives the text part when only HTML was written', () => {
    const body = compileEmailBody({
      bodyHtml: '<p>Hi everyone</p><p>See the <a href="https://example.com/s">schedule</a></p>',
      contentIds: [],
    });
    expect(body.textDerived).toBe(true);
    expect(body.text).toBe('Hi everyone\n\nSee the schedule (https://example.com/s)');
    expect(body.html).toContain('<p>Hi everyone</p>');
  });

  it('keeps the organizer’s own text when both were written', () => {
    const body = compileEmailBody({
      bodyHtml: '<p>Fancy version</p>',
      bodyText: 'Plain version',
      contentIds: [],
    });
    expect(body.textDerived).toBe(false);
    expect(body.text).toBe('Plain version');
    expect(body.html).toBe('<p>Fancy version</p>');
  });

  it('treats a whitespace-only plain body as absent', () => {
    const body = compileEmailBody({ bodyHtml: '<p>Only HTML</p>', bodyText: '   \n  ', contentIds: [] });
    expect(body.textDerived).toBe(true);
    expect(body.text).toBe('Only HTML');
  });

  it('still builds HTML from the plain body when no HTML was written', () => {
    const body = compileEmailBody({ bodyText: 'Just text', contentIds: [] });
    expect(body.textDerived).toBe(false);
    expect(body.text).toBe('Just text');
    expect(body.html).toContain('Just text');
  });

  it('derives text from an HTML body that only places an inline image', () => {
    const body = compileEmailBody({
      bodyHtml: '<p><img src="cid:image1" alt="Poster" width="560"></p>',
      contentIds: ['image1'],
    });
    expect(body.text).toBe('[Poster]');
    expect(body.html).toContain('cid:image1');
  });
});
