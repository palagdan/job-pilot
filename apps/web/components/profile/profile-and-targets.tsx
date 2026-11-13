'use client';

import type { Schedule } from '@job-pilot/shared/schedule';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { callApi } from '../../lib/api/api-client.ts';
import { queryKeys } from '../../lib/api/query-client.ts';
import { ProfileForm } from '../forms/profile-form.tsx';
import { ScheduleForm } from '../forms/schedule-form.tsx';
import { TargetsForm } from '../forms/targets-form.tsx';
import { PageHeader } from '../shell/page-header.tsx';
import { Skeleton, useDelayedFlag } from '../ui/skeleton.tsx';
import { toast } from '../ui/toast.tsx';
import styles from './profile-and-targets.module.css';

const frequencyText: Record<Schedule['frequency'], string> = {
  daily: 'daily',
  every_3_days: 'every 3 days',
  weekly: 'weekly',
};
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "Runs daily at 08:00 · Next run: Mon 16 Nov, 08:00" in the user's time zone. */
const scheduleSummary = (s: Schedule) => {
  const hour = `${String(s.runHour).padStart(2, '0')}:00`;
  const when = s.frequency === 'weekly' && s.dayOfWeek ? `every ${dayNames[s.dayOfWeek - 1]} at ${hour}` : `${frequencyText[s.frequency]} at ${hour}`;
  const next = s.nextRunAt
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: s.timezone,
      }).format(new Date(s.nextRunAt))
    : null;
  return next ? `Runs ${when} · Next run: ${next}` : `Runs ${when}`;
};

const saved = () => toast('Saved');

/** One section: its own data, its own Save (spec: per-section save). */
function Section<T>({
  title,
  description,
  query,
  children,
}: {
  title: string;
  description?: ReactNode;
  query: { isPending: boolean; isError: boolean; data: T | undefined };
  children: (data: T) => ReactNode;
}) {
  const showSkeleton = useDelayedFlag(query.isPending);
  return (
    <section className={styles.card} aria-label={title}>
      <header className={styles.head}>
        <h2>{title}</h2>
        {description && <p className={styles.muted}>{description}</p>}
      </header>
      {query.isPending ? (
        showSkeleton && <Skeleton height={320} radius="12px" />
      ) : query.isError || query.data === undefined ? (
        <p role="alert" className={styles.muted}>
          This section could not be loaded. Reload the page to try again.
        </p>
      ) : (
        children(query.data)
      )}
    </section>
  );
}

/**
 * 11 Profile and targets — "Everything JobPilot believes about you". The same controls as onboarding steps 2–4,
 * each section saved on its own. (The "added from chat — Undo" chip arrives with the chat panel, M5.)
 */
export function ProfileAndTargets() {
  // The forms own their state after the first load; refetching must not overwrite edits.
  const fixed = { refetchOnWindowFocus: false, staleTime: Number.POSITIVE_INFINITY } as const;
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: ({ signal }) => callApi('getProfile', { signal }), ...fixed });
  const targets = useQuery({ queryKey: queryKeys.targets, queryFn: ({ signal }) => callApi('getTargets', { signal }), ...fixed });
  const schedule = useQuery({ queryKey: queryKeys.schedule, queryFn: ({ signal }) => callApi('getSchedule', { signal }), ...fixed });

  return (
    <>
      <PageHeader title="Profile and targets" subtitle="Everything JobPilot believes about you. Always visible, always editable." />
      <div className={styles.columns}>
        <Section title="Profile" query={profile}>
          {(data) => <ProfileForm profile={data} submitLabel="Save profile" onSaved={saved} />}
        </Section>
        <Section title="Targets" description="What the agent looks for, and what it avoids." query={targets}>
          {(data) => <TargetsForm targets={data} submitLabel="Save targets" onSaved={saved} />}
        </Section>
      </div>
      <Section
        title="Schedule and notifications"
        description={schedule.data ? scheduleSummary(schedule.data) : undefined}
        query={schedule}
      >
        {(data) => <ScheduleForm schedule={data} submitLabel="Save schedule" onSaved={saved} />}
      </Section>
    </>
  );
}
