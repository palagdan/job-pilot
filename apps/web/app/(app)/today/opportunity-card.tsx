'use client';

import type { Opportunity } from '@job-pilot/shared/opportunity';
import { skipReasons, type SkipReason } from '@job-pilot/shared/enums';
import { limits } from '@job-pilot/shared/limits';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Badge, FitScore } from '../../../components/ui/status-badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Chip } from '../../../components/ui/chip.tsx';
import { MenuItem, MenuSeparator } from '../../../components/ui/dropdown-menu.tsx';
import { SplitButton } from '../../../components/ui/split-button.tsx';
import { TextInput } from '../../../components/ui/text-input.tsx';
import styles from './today.module.css';

export const skipReasonLabels: Record<SkipReason, string> = {
  just_skip: 'Just skip',
  not_relevant: 'Not relevant',
  wrong_location: 'Wrong location',
  wrong_seniority: 'Wrong seniority',
  company_excluded: 'Exclude this company',
  already_applied: 'Already applied',
  other: 'Other…',
};

const routeLabels = { auto: 'Auto', direct: 'Direct', event: 'Via event' } as const;

const dateFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const meta = (o: Opportunity): string[] =>
  (o.type === 'job'
    ? [o.job.company, o.job.location, o.sourceName]
    : [
        o.event.organizer,
        dateFormat.format(new Date(o.event.startsAt)),
        o.event.online ? 'Online' : o.event.city,
        o.sourceName,
      ]
  ).filter((v): v is string => Boolean(v));

export type CardState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  /** Skipped: collapsed row with Undo for 10 s. */
  | { kind: 'skipped' }
  /** Pursued: "Preparing your pack…". */
  | { kind: 'pursued'; itemId?: string };

export function OpportunityCard({
  opportunity: o,
  state,
  onPursue,
  onSkip,
  onDismiss,
  onUndo,
}: {
  opportunity: Opportunity;
  state: CardState;
  onPursue: () => void;
  onSkip: (reason: SkipReason, note: string | null) => void;
  onDismiss: () => void;
  onUndo: () => void;
}) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [note, setNote] = useState('');
  const title = o.type === 'job' ? o.job.title : o.event.title;
  const expired = o.feedStatus === 'expired';
  const busy = state.kind === 'busy';

  if (state.kind === 'skipped') {
    return (
      <li className={styles.collapsed}>
        <span>Skipped — {title}</span>
        <Button size="sm" variant="ghost" onClick={onUndo}>
          Undo
        </Button>
      </li>
    );
  }

  const submitOther = (event: FormEvent) => {
    event.preventDefault();
    onSkip('other', note.trim() || null);
    setOtherOpen(false);
  };

  return (
    <li className={styles.card} data-expired={expired || undefined} aria-busy={busy || undefined}>
      <div className={styles.cardHead}>
        <Chip>{o.type === 'job' ? 'Job' : 'Event'}</Chip>
        {expired ? <Badge tone="neutral">No longer available</Badge> : o.fitScore !== null && <FitScore score={o.fitScore} />}
      </div>
      <h2 className={styles.cardTitle}>{title}</h2>
      <p className={styles.meta}>{meta(o).filter(Boolean).join(' · ')}</p>
      {!expired && o.why && (
        <p className={styles.why}>
          <strong>Why: </strong>
          {o.why}
        </p>
      )}
      {!expired && o.gapNote && <p className={styles.gap}>{o.gapNote}</p>}
      {!expired && (
        <p className={styles.route}>
          <Chip>{routeLabels[o.route]}</Chip>
          {o.routeReason && <span>{o.routeReason}</span>}
        </p>
      )}

      {state.kind === 'pursued' ? (
        <output className={styles.preparing}>
          Preparing your pack…{' '}
          {state.itemId && (
            <Link className={styles.link} href={`/review/${state.itemId}`}>
              Open in Review
            </Link>
          )}
        </output>
      ) : expired ? (
        <div className={styles.actions}>
          <Button size="sm" onClick={onDismiss} loading={busy}>
            Dismiss
          </Button>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button variant="primary" onClick={onPursue} disabled={busy}>
            Pursue
          </Button>
          <SplitButton
            onClick={() => onSkip('just_skip', null)}
            menuLabel="Skip reasons"
            disabled={busy}
            menu={
              <>
                {skipReasons
                  .filter((r) => r !== 'just_skip' && r !== 'other')
                  .map((r) => (
                    <MenuItem key={r} onSelect={() => onSkip(r, null)}>
                      {skipReasonLabels[r]}
                    </MenuItem>
                  ))}
                <MenuSeparator />
                <MenuItem onSelect={() => setOtherOpen(true)}>{skipReasonLabels.other}</MenuItem>
              </>
            }
          >
            Skip
          </SplitButton>
          <a className={styles.link} href={o.url} target="_blank" rel="noreferrer">
            View original <ExternalLink aria-hidden="true" size={14} />
          </a>
        </div>
      )}

      {otherOpen && state.kind === 'idle' && (
        <form className={styles.other} onSubmit={submitOther}>
          <TextInput
            label="Why skip?"
            value={note}
            maxLength={limits.skipNote.max}
            onChange={(e) => setNote(e.target.value)}
            hint={`${note.length}/${limits.skipNote.max}`}
          />
          <Button type="submit" variant="primary" size="sm">
            Skip
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOtherOpen(false)}>
            Cancel
          </Button>
        </form>
      )}
    </li>
  );
}
