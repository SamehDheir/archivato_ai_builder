import { renderEmailHtml } from './email-template';

describe('renderEmailHtml', () => {
  it('renders the heading, paragraphs, and preview text', () => {
    const html = renderEmailHtml({
      previewText: 'Preview here',
      heading: 'Verify your email',
      paragraphs: ['First line.', 'Second line.'],
    });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Verify your email');
    expect(html).toContain('First line.');
    expect(html).toContain('Second line.');
    expect(html).toContain('Preview here');
    expect(html).toContain('Archivato');
  });

  it('renders a CTA button with a raw-link fallback', () => {
    const html = renderEmailHtml({
      previewText: 'x',
      heading: 'h',
      paragraphs: [],
      button: { label: 'Verify my email', url: 'https://app/verify?t=abc' },
    });
    expect(html).toContain('href="https://app/verify?t=abc"');
    expect(html).toContain('Verify my email');
    expect(html).toContain('paste this link'); // accessible fallback
  });

  it('renders a code box and no button/fallback when only a code is given', () => {
    const html = renderEmailHtml({
      previewText: 'x',
      heading: 'Reset your password',
      paragraphs: ['Use the code below:'],
      code: '123456',
    });
    expect(html).toContain('123456');
    expect(html).not.toContain('paste this link');
  });

  it('HTML-escapes user-controlled text (no injection)', () => {
    const html = renderEmailHtml({
      previewText: 'x',
      heading: 'Ticket: <script>alert(1)</script>',
      paragraphs: ['Body with <b>tags</b> & "quotes"'],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;tags&lt;/b&gt; &amp; &quot;quotes&quot;');
  });

  it('escapes a javascript: URL in the button href', () => {
    const html = renderEmailHtml({
      previewText: 'x',
      heading: 'h',
      paragraphs: [],
      // A malicious link can't break out of the href attribute.
      button: { label: 'Open', url: 'https://x/"><img src=x onerror=alert(1)>' },
    });
    expect(html).not.toContain('onerror=alert(1)>');
    expect(html).toContain('&quot;&gt;&lt;img');
  });
});
