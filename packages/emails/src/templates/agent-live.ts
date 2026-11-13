import type { RunFrequency, WorkFormat } from '@job-pilot/shared/enums';
import {
  button,
  emailColors,
  escapeHtml,
  heading,
  type LayoutLinks,
  layout,
  paragraph,
  textFooter,
} from '../layout.ts';

export type AgentLiveData = {
  name?: string;
  firstName?: string;
  roles: string[];
  locations: string[];
  workFormats: WorkFormat[];
  findJobs: boolean;
  findEvents: boolean;
  frequency: RunFrequency;
  runHour: number;
  dayOfWeek: number | null;
  timezone?: string;
  notifyEmail: boolean;
  notifyPush: boolean;
};

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const formatRuns = (frequency: RunFrequency, runHour: number, dayOfWeek: number | null) => {
  const time = `${String(runHour).padStart(2, '0')}:00`;
  if (frequency === 'every_3_days') return `Every 3 days at ${time}`;
  if (frequency === 'weekly')
    return `Weekly on ${weekdays[(dayOfWeek ?? 1) - 1] ?? 'Monday'} at ${time}`;
  return `Daily at ${time}`;
};

const formatLookingFor = (d: AgentLiveData) => {
  const kinds = d.findJobs && d.findEvents ? 'jobs and events' : d.findEvents ? 'events' : 'jobs';
  return `${d.roles.join(', ')} (${kinds})`;
};

const formatNotify = (d: AgentLiveData) =>
  d.notifyEmail && d.notifyPush
    ? 'Email and push'
    : d.notifyPush
      ? 'Push'
      : d.notifyEmail
        ? 'Email'
        : 'In the app only';

export const summaryLines = (d: AgentLiveData) => [
  { label: 'Looking for', value: formatLookingFor(d) },
  { label: 'Where', value: [...d.locations, ...d.workFormats].join(', ') },
  { label: 'Runs', value: formatRuns(d.frequency, d.runHour, d.dayOfWeek) },
  { label: 'Notifies by', value: formatNotify(d) },
];

const firstNameOf = (d: AgentLiveData) =>
  d.firstName?.trim() || d.name?.trim().split(/\s+/)[0] || 'there';

export const agentLive = (data: AgentLiveData, links: LayoutLinks) => {
  const greeting = `Hi ${firstNameOf(data)},`;
  const intro =
    'Your JobPilot agent is set up. Your new CV is ready, please check it before we use it.';
  const url = `${links.webUrl}/cvs/new`;
  const lines = summaryLines(data);
  const rows = lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 16px 6px 0;font-size:14px;color:${emailColors.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(l.label)}</td><td style="padding:6px 0;font-size:16px;color:${emailColors.ink};">${escapeHtml(l.value)}</td></tr>`,
    )
    .join('');
  const body = [
    heading('Your CV is ready to review'),
    paragraph(greeting),
    paragraph(intro),
    button('Review your new CV', url),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">${rows}</table>`,
  ].join('');
  return {
    subject: 'Your JobPilot agent is live',
    html: layout({ preheader: 'Your CV is ready to review.', body, links }),
    text: `${greeting}\n\n${intro}\n\nReview your new CV: ${url}\n\n${lines.map((l) => `${l.label}: ${l.value}`).join('\n')}\n\n${textFooter(links)}`,
  };
};
