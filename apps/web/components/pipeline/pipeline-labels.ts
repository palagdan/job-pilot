import type { PipelineSort, PipelineStatusGroup, Route } from '@job-pilot/shared/enums';
import type { PipelineItem } from '@job-pilot/shared/pipeline';

export const routeLabel: Record<Route, string> = { auto: 'Auto', direct: 'Direct', event: 'Event' };

/** Spec "Pipeline filters". */
export const statusGroupLabel: Record<PipelineStatusGroup, string> = {
  ready_to_send: 'Ready to send',
  in_progress: 'In progress',
  got_reply: 'Got a reply',
  closed: 'Closed',
  failed: 'Failed',
};

/** Spec "Pipeline sort". */
export const sortLabel: Record<PipelineSort, string> = {
  next_follow_up: 'Next follow-up',
  newest: 'Newest first',
  status: 'Status',
  company: 'Company A-Z',
};

/** "Head of Growth - Company D" for jobs, the event title for events (Figma 10). */
export const itemTitle = (item: Pick<PipelineItem, 'type' | 'title' | 'company'>) =>
  item.type === 'job' && item.company ? `${item.title} - ${item.company}` : item.title;

/** Where "Open" goes: 08 Review for the item (Daniil). */
export const reviewPath = (id: string) => `/review/${id}`;
