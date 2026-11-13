'use client';

import type { Draft } from '@job-pilot/shared/draft';
import type { PipelineItem } from '@job-pilot/shared/pipeline';
import type { FollowUp } from '@job-pilot/shared/review';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../../components/ui/button.tsx';
import { toast } from '../../../components/ui/toast.tsx';
import { ApiError, callApi } from '../../../lib/api/api-client.ts';
import { notifyError } from '../../../lib/errors/notify-error.ts';
import { DraftCard } from './draft-card.tsx';
import styles from './review.module.css';

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

const statusText = (f: FollowUp, now: number): string => {
  if (f.status === 'done') return `Sent on ${f.completedAt ? shortDate.format(new Date(f.completedAt)) : ''}`;
  if (f.status === 'cancelled') return 'Cancelled';
  return new Date(f.dueAt).getTime() <= now ? `Due since ${shortDate.format(new Date(f.dueAt))}` : `Due on ${shortDate.format(new Date(f.dueAt))}`;
};

/** Follow-ups of a sent application: status, drafted text (edit / copy), "I sent the follow-up", "They replied". */
export function FollowUpsSection({
  item,
  followUps,
  onDirtyChange,
  onSaved,
  onReload,
  onChanged,
  onUndo,
}: {
  item: PipelineItem;
  followUps: FollowUp[];
  onDirtyChange: (id: string, dirty: boolean) => void;
  onSaved: (draft: Draft) => void;
  onReload: () => Promise<unknown>;
  onChanged: () => Promise<unknown>;
  onUndo: (token: string) => void;
}) {
  const sent = item.status === 'sent';
  const noReply = item.status === 'no_reply';
  const [now] = useState(() => Date.now());

  const complete = useMutation({
    mutationFn: (id: string) => callApi('completeFollowUp', { params: { id } }),
    onSuccess: async ({ undoToken, nextFollowUpAt }) => {
      await onChanged();
      toast(nextFollowUpAt ? `Follow-up marked as sent — next one on ${shortDate.format(new Date(nextFollowUpAt))}` : 'Follow-up marked as sent', {
        undo: () => onUndo(undoToken),
      });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'conflict') {
        toast.error(e.message);
        void onChanged();
      } else notifyError(e, 'Could not save. Check your connection.');
    },
  });

  const replied = useMutation({
    mutationFn: () => callApi('updatePipelineStatus', { params: { id: item.id }, body: { status: 'replied', interviewAt: null } }),
    onSuccess: async () => {
      toast('Marked as replied');
      await onChanged();
    },
    onError: (e) => notifyError(e, 'Could not save. Check your connection.', { retry: () => replied.mutate() }),
  });

  if (!sent && !noReply && followUps.length === 0) return null;

  return (
    <section aria-label="Follow-ups">
      <h2 className={styles.sectionTitle}>Follow-ups</h2>
      {noReply && <p className={styles.muted}>No reply after two follow-ups. Try another route, for example a direct message to the hiring manager or a recruiter.</p>}
      {followUps.length === 0 ? (
        <p className={styles.muted}>No follow-ups scheduled.</p>
      ) : (
        <ul className={styles.drafts}>
          {followUps.map((f) => (
            <li key={f.id} className={styles.followUp}>
              <div className={styles.draftHead}>
                <h3 className={styles.draftTitle}>
                  Follow-up #{f.sequence} <span className={styles.edited}>· {statusText(f, now)}</span>
                </h3>
                {sent && f.status === 'pending' && (
                  <Button variant="primary" size="sm" onClick={() => complete.mutate(f.id)} loading={complete.isPending && complete.variables === f.id} disabled={!f.draft} disabledReason="The text is not ready yet">
                    I sent the follow-up
                  </Button>
                )}
              </div>
              {f.draft ? (
                <ul className={styles.drafts}>
                  <DraftCard draft={f.draft} onDirtyChange={onDirtyChange} onSaved={onSaved} onReload={onReload} />
                </ul>
              ) : f.status === 'pending' ? (
                <p className={styles.muted}>{new Date(f.dueAt).getTime() <= now ? 'Your agent is writing this text. Check back in a few minutes.' : `Your agent will draft this text on ${shortDate.format(new Date(f.dueAt))}.`}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {(sent || noReply) && (
        <div className={styles.doneActions}>
          <Button onClick={() => replied.mutate()} loading={replied.isPending}>
            They replied
          </Button>
        </div>
      )}
    </section>
  );
}
