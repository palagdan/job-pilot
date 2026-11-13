import { describe, expect, it } from 'vitest';
import { button, escapeHtml, layout, paragraph } from './layout.ts';

const links = {
  webUrl: 'https://app.example.com',
  unsubscribeUrl: 'https://api.example.com/u?t=1',
};

describe('layout', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<script>"a" & 'b'</script>`)).toBe(
      '&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;',
    );
    expect(paragraph('<b>x</b>')).not.toContain('<b>');
    expect(button('Go', 'https://x.test/?a="1"')).not.toContain('"1"');
  });

  it('has the footer, manage and unsubscribe links', () => {
    const html = layout({ preheader: 'p', body: '<p>hi</p>', links });
    expect(html).toContain('JobPilot prepares, you always send it yourself.');
    expect(html).toContain('href="https://app.example.com/settings"');
    expect(html).toContain('href="https://api.example.com/u?t=1"');
    expect(html).toContain('max-width:560px');
  });
});
