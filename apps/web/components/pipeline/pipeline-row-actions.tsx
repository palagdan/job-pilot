'use client';

import type { Route } from '@job-pilot/shared/enums';
import type { PipelineItem } from '@job-pilot/shared/pipeline';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type ManualStatus, usePipelineActions } from '../../lib/api/use-pipeline.ts';
import { ConfirmDialog } from '../ui/dialog.tsx';
import { MenuItem, MenuLabel, MenuSeparator } from '../ui/dropdown-menu.tsx';
import { SplitButton } from '../ui/split-button.tsx';
import { InterviewDialog } from './interview-dialog.tsx';
import { NotesDialog } from './notes-dialog.tsx';
import { itemTitle, reviewPath, routeLabel } from './pipeline-labels.ts';

/** Same rules as the api: the route can change until it is sent; replies only after sending (jobs). */
const beforeSending = new Set(['preparing', 'ready_to_send', 'failed']);
const answerable = new Set(['sent', 'replied', 'interview', 'offer', 'no_reply', 'rejected']);

const routeChoices = (item: PipelineItem): { route: Route; reason?: string }[] =>
  item.type === 'job'
    ? [{ route: 'auto' }, { route: 'direct' }, { route: 'event', reason: 'Jobs have no event route' }]
    : [{ route: 'auto' }, { route: 'direct', reason: 'Events have no direct application' }, { route: 'event' }];

/** Pipeline row: "Open" → Review, the arrow opens the row menu (spec "Pipeline row menu"). */
export function PipelineRowActions({ item }: { item: PipelineItem }) {
  const router = useRouter();
  const actions = usePipelineActions(item);
  const [dialog, setDialog] = useState<'stop' | 'interview' | 'notes' | null>(null);
  const close = (open: boolean) => !open && setDialog(null);
  const name = itemTitle(item);

  const status = (s: ManualStatus) => actions.setStatus.mutate({ status: s });
  const canAnswer = item.type === 'job' && answerable.has(item.status);

  return (
    <>
      <SplitButton
        onClick={() => router.push(reviewPath(item.id))}
        menuLabel={`More actions for ${name}`}
        menu={
          <>
            <MenuItem onSelect={() => router.push(reviewPath(item.id))}>Open</MenuItem>
            {beforeSending.has(item.status) && (
              <>
                <MenuSeparator />
                <MenuLabel>Change route</MenuLabel>
                {routeChoices(item).map((c) => (
                  <MenuItem
                    key={c.route}
                    selected={item.route === c.route}
                    disabled={Boolean(c.reason) || actions.changeRoute.isPending}
                    disabledReason={c.reason}
                    description={c.route === 'auto' ? 'Agent picks the best way in' : undefined}
                    onSelect={() => item.route !== c.route && actions.changeRoute.mutate(c.route)}
                  >
                    {routeLabel[c.route]}
                  </MenuItem>
                ))}
              </>
            )}
            {canAnswer && (
              <>
                <MenuSeparator />
                {item.status !== 'replied' && <MenuItem onSelect={() => status('replied')}>Mark as replied</MenuItem>}
                <MenuItem onSelect={() => setDialog('interview')}>
                  {item.status === 'interview' ? 'Change interview date' : 'Mark as interview'}
                </MenuItem>
                {item.status !== 'offer' && <MenuItem onSelect={() => status('offer')}>Mark as offer</MenuItem>}
                {item.status !== 'rejected' && <MenuItem onSelect={() => status('rejected')}>Mark as rejected</MenuItem>}
              </>
            )}
            <MenuSeparator />
            <MenuItem onSelect={() => setDialog('notes')}>
              {item.notesCount > 0 ? `Notes (${item.notesCount})` : 'Add note'}
            </MenuItem>
            {item.status !== 'skipped' && (
              <MenuItem tone="danger" onSelect={() => setDialog('stop')}>
                Stop pursuing
              </MenuItem>
            )}
          </>
        }
      >
        Open
      </SplitButton>

      {/* C06 Stop pursuing */}
      <ConfirmDialog
        open={dialog === 'stop'}
        onOpenChange={close}
        tone="danger"
        title={`Stop pursuing ${item.company ?? item.title}?`}
        description="Scheduled follow-ups are cancelled and the status changes to Skipped."
        confirmLabel="Stop pursuing"
        onConfirm={() => actions.stop.mutateAsync()}
      />
      {dialog === 'interview' && <InterviewDialog item={item} open onOpenChange={close} />}
      {dialog === 'notes' && <NotesDialog item={item} open onOpenChange={close} />}
    </>
  );
}
