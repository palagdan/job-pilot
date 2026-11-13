'use client';

import { type PipelineSort, type PipelineStatusGroup, pipelineSorts } from '@job-pilot/shared/enums';
import type { PipelineStats } from '@job-pilot/shared/pipeline';
import Link from 'next/link';
import { useState } from 'react';
import { type PipelineFilters, usePipelineList, usePipelineStats } from '../../lib/api/use-pipeline.ts';
import { PageHeader } from '../shell/page-header.tsx';
import { Button } from '../ui/button.tsx';
import { Chip } from '../ui/chip.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Select } from '../ui/select.tsx';
import { Skeleton, useDelayedFlag } from '../ui/skeleton.tsx';
import { PipelineStatusBadge } from '../ui/status-badge.tsx';
import { Table, TBody, Td, Th, THead, Tr } from '../ui/table.tsx';
import { itemTitle, routeLabel, sortLabel, statusGroupLabel } from './pipeline-labels.ts';
import { PipelineRowActions } from './pipeline-row-actions.tsx';
import styles from './pipeline.module.css';

const ALL = 'all';

const stats: { key: keyof PipelineStats; label: string }[] = [
  { key: 'readyToSend', label: 'Ready to send' },
  { key: 'sent', label: 'Sent' },
  { key: 'replied', label: 'Replied' },
  { key: 'interviews', label: 'Interviews' },
  { key: 'offers', label: 'Offers' },
];

const statusOptions = [
  { value: ALL, label: 'All statuses' },
  ...Object.entries(statusGroupLabel).map(([value, label]) => ({ value, label })),
];
const typeOptions = [
  { value: ALL, label: 'All types' },
  { value: 'job', label: 'Job' },
  { value: 'event', label: 'Event' },
];
const sortOptions = pipelineSorts.map((value) => ({ value, label: sortLabel[value] }));

function StatsRow() {
  const query = usePipelineStats();
  return (
    <dl className={styles.stats}>
      {stats.map((s) => (
        <div key={s.key} className={styles.stat}>
          <dt>{s.label}</dt>
          <dd>{query.data ? query.data[s.key] : <Skeleton width={24} height={28} />}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 10 Pipeline — everything in motion: stats, filters + sort, table with row menu. */
export function PipelinePage() {
  const [filters, setFilters] = useState<PipelineFilters>({ sort: 'next_follow_up' });
  const list = usePipelineList(filters);
  const showSkeleton = useDelayedFlag(list.isPending);
  const filtered = Boolean(filters.statusGroup || filters.type);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const clear = () => setFilters((f) => ({ sort: f.sort }));
  const nothingYet = !filtered && list.isSuccess && items.length === 0;

  return (
    <>
      <PageHeader title="Pipeline" subtitle="Everything in motion" />
      <StatsRow />

      {!nothingYet && (
        <div className={styles.toolbar}>
          <div className={styles.filters}>
            <Select
              label={<span className={styles.srOnly}>Status</span>}
              options={statusOptions}
              value={filters.statusGroup ?? ALL}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, statusGroup: v === ALL ? undefined : (v as PipelineStatusGroup) }))
              }
            />
            <Select
              label={<span className={styles.srOnly}>Type</span>}
              options={typeOptions}
              value={filters.type ?? ALL}
              onValueChange={(v) => setFilters((f) => ({ ...f, type: v === ALL ? undefined : (v as 'job' | 'event') }))}
            />
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clear}>
                Clear filters
              </Button>
            )}
          </div>
          <div className={styles.sort}>
            <Select
              label={<span className={styles.srOnly}>Sort</span>}
              options={sortOptions}
              value={filters.sort}
              onValueChange={(v) => setFilters((f) => ({ ...f, sort: v as PipelineSort }))}
            />
          </div>
        </div>
      )}

      {list.isPending ? (
        showSkeleton && <Skeleton height={320} radius="16px" />
      ) : list.isError ? (
        <p role="alert">We could not load your pipeline. Reload the page to try again.</p>
      ) : nothingYet ? (
        <EmptyState
          title="Nothing in motion yet"
          description="Everything you pursue is tracked here with its status and next step."
          action={
            <Link href="/today" className={styles.cta}>
              Open Today
            </Link>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing matches these filters"
          description="Try another status or type."
          action={<Button onClick={clear}>Clear filters</Button>}
        />
      ) : (
        <>
          <Table aria-label="Pipeline" className={styles.table}>
            <THead>
              <Tr>
                <Th>Opportunity</Th>
                <Th>Type</Th>
                <Th>Route</Th>
                <Th>Status</Th>
                <Th>Next follow-up</Th>
                <Th>
                  <span className={styles.srOnly}>Actions</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td className={styles.title}>
                    {itemTitle(item)}
                    {item.notesCount > 0 && (
                      <span className={styles.notesCount}>
                        {item.notesCount === 1 ? '1 note' : `${item.notesCount} notes`}
                      </span>
                    )}
                  </Td>
                  <Td>{item.type === 'job' ? 'Job' : 'Event'}</Td>
                  <Td>
                    <Chip>{routeLabel[item.route]}</Chip>
                  </Td>
                  <Td>
                    <PipelineStatusBadge status={item.status} />
                  </Td>
                  <Td className={styles.next}>{item.nextStep ?? '-'}</Td>
                  <Td className={styles.actions}>
                    <PipelineRowActions item={item} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {list.hasNextPage && (
            <div className={styles.more}>
              <Button onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage} loadingLabel="Loading...">
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
