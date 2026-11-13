import {
  button,
  emailColors,
  escapeHtml,
  heading,
  type LayoutLinks,
  layout,
  textFooter,
} from '../layout.ts';

/** Email 04 "Run digest" (Emails page): sent after a run, only when the run found something new. */
export type RunDigestData = {
  newJobs: number;
  newEvents: number;
  readyToSend: { count: number; companies: string[] };
  followUpsDue: { count: number; companies: string[] };
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Company A, Company D" — at most 3 names, then "and 2 more". */
export const companyList = (companies: string[]) => {
  const unique = [...new Set(companies.filter(Boolean))];
  if (unique.length <= 3) return unique.join(', ');
  return `${unique.slice(0, 3).join(', ')} and ${unique.length - 3} more`;
};

/** "3 jobs, 2 events" (only the kinds that are present). */
export const newBreakdown = (d: RunDigestData) =>
  [
    d.newJobs ? plural(d.newJobs, 'job', 'jobs') : null,
    d.newEvents ? plural(d.newEvents, 'event', 'events') : null,
  ]
    .filter(Boolean)
    .join(', ');

/** Subject per Figma: "6 new, 2 ready to send"; without packs: "6 new matches". */
export const digestSubject = (d: RunDigestData) => {
  const total = d.newJobs + d.newEvents;
  return d.readyToSend.count > 0
    ? `${total} new, ${d.readyToSend.count} ready to send`
    : `${plural(total, 'new match', 'new matches')}`;
};

export const digestRows = (d: RunDigestData) =>
  [
    {
      label: plural(d.newJobs + d.newEvents, 'new opportunity', 'new opportunities'),
      value: newBreakdown(d),
    },
    d.readyToSend.count > 0
      ? {
          label: `${plural(d.readyToSend.count, 'pack is', 'packs are')} ready to send`,
          value: companyList(d.readyToSend.companies),
        }
      : null,
    d.followUpsDue.count > 0
      ? {
          label: `${plural(d.followUpsDue.count, 'follow-up is', 'follow-ups are')} due`,
          value: companyList(d.followUpsDue.companies),
        }
      : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

export const runDigest = (data: RunDigestData, links: LayoutLinks) => {
  const url = `${links.webUrl}/today`;
  const rows = digestRows(data);
  const intro = 'Your agent finished its run.';
  const table = rows
    .map(
      (r) =>
        `<tr><td style="padding:10px 16px 10px 0;font-size:16px;font-weight:600;color:${emailColors.ink};vertical-align:top;border-top:1px solid ${emailColors.line};">${escapeHtml(r.label)}</td><td style="padding:10px 0;font-size:15px;color:${emailColors.muted};border-top:1px solid ${emailColors.line};">${escapeHtml(r.value)}</td></tr>`,
    )
    .join('');
  const body = [
    heading(intro),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">${table}</table>`,
    button('Open Today', url),
  ].join('');
  return {
    subject: digestSubject(data),
    html: layout({ preheader: `${newBreakdown(data)}.`, body, links }),
    text: `${intro}\n\n${rows.map((r) => `${r.label}: ${r.value}`).join('\n')}\n\nOpen Today: ${url}\n\n${textFooter(links)}`,
  };
};
