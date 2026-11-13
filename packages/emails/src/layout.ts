const escapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes a value for use in HTML text or a double-quoted attribute. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => escapes[ch] ?? ch);

const colors = {
  primary: '#1F5BFF',
  ink: '#0B0D12',
  surface: '#F6F7F9',
  soft: '#EAF0FF',
  accent: '#12A150',
  line: '#E4E7EC',
  muted: '#5B6270',
};

const headingFont = "'Space Grotesk', 'Helvetica Neue', Arial, sans-serif";
const textFont = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

export const emailColors = colors;
export const emailFonts = { heading: headingFont, text: textFont };

export type LayoutLinks = {
  /** `${WEB_URL}` origin. */
  webUrl: string;
  unsubscribeUrl: string;
};

/** Paragraph of body text. `text` is escaped. */
export const paragraph = (text: string) =>
  `<p style="margin:0 0 16px;font-family:${textFont};font-size:16px;line-height:24px;color:${colors.ink};">${escapeHtml(text)}</p>`;

export const heading = (text: string) =>
  `<h1 style="margin:0 0 16px;font-family:${headingFont};font-size:26px;line-height:32px;font-weight:700;color:${colors.ink};">${escapeHtml(text)}</h1>`;

/** Bulletproof table button. */
export const button = (label: string, href: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td style="border-radius:10px;background:${colors.primary};"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;font-family:${textFont};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a></td></tr></table>`;

/** Wraps already-safe body HTML in the shared JobPilot layout (logo, footer, manage/unsubscribe links). */
export const layout = ({
  preheader,
  body,
  links,
}: {
  preheader: string;
  body: string;
  links: LayoutLinks;
}) => {
  const manageUrl = `${links.webUrl}/settings`;
  const footerLink = (label: string, href: string) =>
    `<a href="${escapeHtml(href)}" style="color:${colors.muted};text-decoration:underline;">${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>JobPilot</title>
</head>
<body style="margin:0;padding:0;background:${colors.surface};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${colors.surface};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 0 16px;font-family:${headingFont};font-size:20px;font-weight:700;color:${colors.primary};">&#9678; JobPilot</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${colors.line};border-radius:16px;padding:32px;">${body}</td></tr>
<tr><td style="padding:16px 8px 0;font-family:${textFont};font-size:13px;line-height:20px;color:${colors.muted};text-align:center;">
JobPilot prepares, you always send it yourself.<br>
${footerLink('Manage notifications', manageUrl)} &middot; ${footerLink('Unsubscribe', links.unsubscribeUrl)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

/** Plain-text footer matching the HTML one. */
export const textFooter = (links: LayoutLinks) =>
  `--\nJobPilot prepares, you always send it yourself.\nManage notifications: ${links.webUrl}/settings\nUnsubscribe: ${links.unsubscribeUrl}\n`;
