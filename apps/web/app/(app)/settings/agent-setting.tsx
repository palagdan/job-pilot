'use client';

import { Button } from '../../../components/ui/button.tsx';
import { ConfirmDialog } from '../../../components/ui/dialog.tsx';
import { Skeleton } from '../../../components/ui/skeleton.tsx';
import { useAgentControls, useAgentStatus } from '../../../lib/api/use-agent.ts';
import styles from './settings.module.css';

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );

/** Settings > Agent: running or paused, next run, Pause (C07) / Resume. */
export function AgentSetting() {
  const status = useAgentStatus();
  const controls = useAgentControls();

  if (status.isPending) return <Skeleton height={40} />;
  if (status.isError) return <p className={styles.muted}>The agent status could not be loaded.</p>;

  const s = status.data;
  return (
    <div className={styles.row}>
      <div>
        <p className={styles.label}>{s.paused ? 'Your agent is paused' : 'Your agent is running'}</p>
        <p className={styles.muted}>
          {s.paused
            ? 'No runs and no emails until you resume.'
            : s.currentRun
              ? 'A run is in progress.'
              : s.nextRunAt
                ? `Next run: ${when(s.nextRunAt)}`
                : 'The first run is scheduled after setup.'}
        </p>
      </div>
      {s.paused ? (
        <Button variant="primary" onClick={controls.resume} loading={controls.resuming}>
          Resume agent
        </Button>
      ) : (
        <Button onClick={controls.requestPause}>Pause agent</Button>
      )}
      <ConfirmDialog {...controls.confirm} />
    </div>
  );
}
