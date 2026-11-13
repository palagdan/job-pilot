'use client';

import type { AgentRun } from '@job-pilot/shared/agent-run';
import type { SkipReason } from '@job-pilot/shared/enums';
import type { OpportunityType } from '@job-pilot/shared/enums';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Circle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../../../components/shell/page-header.tsx';
import { Banner } from '../../../components/ui/banner.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { ChipGroup } from '../../../components/ui/chip.tsx';
import { EmptyState } from '../../../components/ui/empty-state.tsx';
import { Skeleton, useDelayedFlag } from '../../../components/ui/skeleton.tsx';
import { Spinner } from '../../../components/ui/spinner.tsx';
import { toast } from '../../../components/ui/toast.tsx';
import { ApiError, callApi } from '../../../lib/api/api-client.ts';
import { type CardState, OpportunityCard } from './opportunity-card.tsx';
import styles from './today.module.css';
import { useAgentStatus, useRunNow, useTodayFeed, useTodayTargets } from './use-today.ts';

const UNDO_WINDOW_MS = 10_000;
const PURSUED_LINGER_MS = 4_000;

type Filter = 'all' | OpportunityType;

const stepLabels: Record<string, string> = {
  read_postings: 'Reading new postings',
  check_sources: 'Checking your sources',
  rank_matches: 'Ranking matches for you',
  prepare_digest: 'Preparing your list',
};

const todayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function RunProgress({ run }: { run: AgentRun }) {
  return (
    <section className={styles.run} aria-live="polite">
      <h2 className={styles.runTitle}>
        <Spinner size={16} /> Your agent is working…
      </h2>
      <ul className={styles.steps}>
        {run.steps.map((s) => (
          <li key={s.key} data-status={s.status}>
            {s.status === 'done' ? <Check aria-hidden="true" size={14} /> : s.status === 'in_progress' ? <Spinner size={12} /> : <Circle aria-hidden="true" size={12} />}
            {stepLabels[s.key] ?? s.key}
          </li>
        ))}
      </ul>
      {run.slow && <p className={styles.runSlow}>This is taking longer than usual.</p>}
    </section>
  );
}

const failed = (error: unknown, retry?: () => void) => {
  const message = error instanceof ApiError && error.code === 'network' ? 'You are offline. Try again.' : error instanceof ApiError ? error.message : 'Something went wrong.';
  toast.error(message, { retry });
};

/** 07 Today (spec §8.1): header, filter chips, opportunity cards, run panel and empty states. */
export function TodayScreen() {
  const queryClient = useQueryClient();
  const feed = useTodayFeed();
  const targets = useTodayTargets();
  const status = useAgentStatus();
  const runNow = useRunNow();
  const [now] = useState(() => new Date());
  const [filter, setFilter] = useState<Filter>('all');
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const tokens = useRef(new Map<string, string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const showSkeleton = useDelayedFlag(feed.isPending);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending.values()) clearTimeout(t);
    };
  }, []);

  const setCard = (id: string, state: CardState | null) =>
    setCards((prev) => {
      const next = { ...prev };
      if (state) next[id] = state;
      else delete next[id];
      return next;
    });
  const later = (id: string, ms: number, fn: () => void) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(fn, ms));
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['today'] });

  const undoMutation = useMutation({ mutationFn: (token: string) => callApi('undo', { body: { undoToken: token } }) });
  const undoSkip = (id: string) => {
    const token = tokens.current.get(id);
    if (!token) return;
    clearTimeout(timers.current.get(id));
    setCard(id, { kind: 'busy' });
    undoMutation.mutate(token, {
      onSuccess: () => {
        tokens.current.delete(id);
        setCard(id, null);
        void refresh();
      },
      onError: (error) => {
        // Window passed: the skip stands.
        setCard(id, null);
        void refresh();
        failed(error);
      },
    });
  };

  const skipMutation = useMutation({
    mutationFn: ({ id, reason, note }: { id: string; reason: SkipReason; note: string | null }) =>
      callApi('skip', { params: { id }, body: { reason, note } }),
  });
  const skip = (id: string, title: string, reason: SkipReason, note: string | null) => {
    setCard(id, { kind: 'busy' });
    skipMutation.mutate(
      { id, reason, note },
      {
        onSuccess: ({ undoToken, addedExclusion }) => {
          tokens.current.set(id, undoToken);
          setCard(id, { kind: 'skipped' });
          later(id, UNDO_WINDOW_MS, () => {
            tokens.current.delete(id);
            setCard(id, null);
            void refresh();
          });
          toast(addedExclusion ? `Skipped — ${addedExclusion} excluded` : `Skipped — ${title}`, { undo: () => undoSkip(id) });
        },
        onError: (error) => {
          setCard(id, null);
          failed(error, () => skip(id, title, reason, note));
        },
      },
    );
  };

  const pursueMutation = useMutation({ mutationFn: (id: string) => callApi('pursue', { params: { id } }) });
  const pursue = (id: string) => {
    setCard(id, { kind: 'busy' });
    pursueMutation.mutate(id, {
      onSuccess: (item) => {
        setCard(id, { kind: 'pursued', itemId: item.id });
        void queryClient.invalidateQueries({ queryKey: ['pipeline'] });
        later(id, PURSUED_LINGER_MS, () => {
          setCard(id, null);
          void refresh();
        });
      },
      onError: (error) => {
        setCard(id, null);
        failed(error, () => pursue(id));
      },
    });
  };

  const dismissMutation = useMutation({ mutationFn: (id: string) => callApi('dismiss', { params: { id } }) });
  const dismiss = (id: string) => {
    setCard(id, { kind: 'busy' });
    dismissMutation.mutate(id, {
      onSuccess: () => {
        setCard(id, null);
        void refresh();
      },
      onError: (error) => {
        setCard(id, null);
        failed(error, () => dismiss(id));
      },
    });
  };

  const run = () =>
    runNow.mutate(undefined, {
      onError: (error) => {
        if (!(error instanceof ApiError && error.code === 'agent_busy')) failed(error, run);
      },
    });

  const data = feed.data;
  const currentRun = status.data?.currentRun ?? null;
  const lastRun = status.data?.lastRun ?? null;
  const findJobs = targets.data?.findJobs ?? true;
  const findEvents = targets.data?.findEvents ?? true;

  const allItems = data?.items ?? [];
  const newCount = allItems.filter((i) => i.feedStatus !== 'expired').length;
  const chips = [
    { value: 'all' as const, label: 'All', count: data?.counts.all ?? 0, disabled: (data?.counts.all ?? 0) === 0 },
    ...(findJobs ? [{ value: 'job' as const, label: 'Jobs', count: data?.counts.job ?? 0, disabled: (data?.counts.job ?? 0) === 0 }] : []),
    ...(findEvents ? [{ value: 'event' as const, label: 'Events', count: data?.counts.event ?? 0, disabled: (data?.counts.event ?? 0) === 0 }] : []),
  ];
  // A type with no cards (or turned off) cannot stay selected.
  const activeFilter = chips.some((c) => c.value === filter && !c.disabled) ? filter : 'all';
  const visible = activeFilter === 'all' ? allItems : allItems.filter((i) => i.type === activeFilter);

  const runButton = (
    <Button variant="primary" onClick={run} loading={runNow.isPending || Boolean(currentRun)} loadingLabel="Agent is working…" icon={<Sparkles aria-hidden="true" size={16} />}>
      Run now
    </Button>
  );

  const body = () => {
    if (feed.isPending) {
      return showSkeleton ? (
        <ul className={styles.list} aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <li key={i} className={styles.card}>
              <Skeleton width={120} height={22} radius="999px" />
              <Skeleton width="60%" height={22} />
              <Skeleton width="40%" />
              <Skeleton height={44} />
              <Skeleton width={200} height={36} radius="999px" />
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ height: 320 }} />
      );
    }
    if (feed.isError) {
      return (
        <EmptyState
          title="Could not load Today"
          description="Check your connection and try again."
          action={<Button onClick={() => void feed.refetch()}>Try again</Button>}
        />
      );
    }
    if (visible.length > 0 || Object.keys(cards).length > 0) {
      return (
        <ul className={styles.list}>
          {visible.map((o) => (
            <OpportunityCard
              key={o.id}
              opportunity={o}
              state={cards[o.id] ?? { kind: 'idle' }}
              onPursue={() => pursue(o.id)}
              onSkip={(reason, note) => skip(o.id, o.type === 'job' ? o.job.title : o.event.title, reason, note)}
              onDismiss={() => dismiss(o.id)}
              onUndo={() => undoSkip(o.id)}
            />
          ))}
        </ul>
      );
    }
    if (currentRun) return null; // the run panel above is the message
    if (!lastRun) {
      return (
        <EmptyState
          icon={<Sparkles aria-hidden="true" />}
          title="Your agent hasn't run yet"
          description="Run it now to get your first matches, or wait for the next scheduled run."
          action={runButton}
        />
      );
    }
    return lastRun.newCount === 0 ? (
      <EmptyState
        title="Nothing new this time"
        description="The agent found no new matches. It will keep looking on schedule."
        action={runButton}
      />
    ) : (
      <EmptyState title="All caught up" description="You've handled every match from the last run. New ones appear after the next run." action={runButton} />
    );
  };

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={
          <>
            {todayLabel.format(now)}
            {data && ` — ${newCount} new, `}
            {data && (data.readyToSendCount > 0 ? <Link href="/review">{data.readyToSendCount} ready to send</Link> : '0 ready to send')}
          </>
        }
        actions={data && data.items.length > 0 ? runButton : undefined}
      />
      {currentRun && <RunProgress run={currentRun} />}
      {!currentRun && lastRun?.status === 'failed' && (
        <Banner tone="danger" title="The last run did not finish" action={{ label: 'Run again', onClick: run }}>
          Nothing was lost. Try running the agent again.
        </Banner>
      )}
      {data && data.counts.all > 0 && (
        <div className={styles.filters}>
          <ChipGroup type="single" label="Filter by type" options={chips} value={activeFilter} onChange={setFilter} />
        </div>
      )}
      {body()}
    </>
  );
}
