import type { CvStatus, PipelineStatus } from '@job-pilot/shared/enums';
import type { ReactNode } from 'react';
import styles from './status-badge.module.css';

export type BadgeTone = 'primary' | 'neutral' | 'success' | 'warning' | 'danger';

/** Small pill (Figma status chip: soft + primary, 12/600). */
export function Badge({ tone = 'primary', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {children}
    </span>
  );
}

/** "87% fit" — solid accent (Figma "Fit score"). */
export function FitScore({ score }: { score: number }) {
  return <span className={styles.fit}>{Math.round(score)}% fit</span>;
}

const pipeline: Record<PipelineStatus, { label: string; tone: BadgeTone }> = {
  preparing: { label: 'Preparing', tone: 'neutral' },
  ready_to_send: { label: 'Ready to send', tone: 'primary' },
  sent: { label: 'Sent', tone: 'primary' },
  registered: { label: 'Registered', tone: 'primary' },
  replied: { label: 'Replied', tone: 'primary' },
  interview: { label: 'Interview', tone: 'primary' },
  offer: { label: 'Offer', tone: 'success' },
  no_reply: { label: 'No reply', tone: 'primary' },
  rejected: { label: 'Rejected', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
};

const cv: Record<CvStatus, { label: string; tone: BadgeTone }> = {
  generating: { label: 'Generating', tone: 'neutral' },
  needs_review: { label: 'Needs your review', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  ready_to_send: { label: 'Ready to send', tone: 'primary' },
  sent: { label: 'Sent', tone: 'primary' },
  failed: { label: 'Failed', tone: 'danger' },
};

export const pipelineStatusLabel = (status: PipelineStatus) => pipeline[status].label;

export function PipelineStatusBadge({ status }: { status: PipelineStatus }) {
  return <Badge tone={pipeline[status].tone}>{pipeline[status].label}</Badge>;
}

export function CvStatusBadge({ status }: { status: CvStatus }) {
  return <Badge tone={cv[status].tone}>{cv[status].label}</Badge>;
}
