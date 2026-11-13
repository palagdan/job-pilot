'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ScheduleForm } from '../../../components/forms/schedule-form.tsx';
import formStyles from '../../../components/forms/schedule-form.module.css';
import { Skeleton, useDelayedFlag } from '../../../components/ui/skeleton.tsx';
import { callApi } from '../../../lib/api/api-client.ts';
import { queryKeys } from '../../../lib/api/query-client.ts';
import { onboardingPath } from '../../../lib/onboarding/steps.ts';
import styles from '../onboarding.module.css';

/** Onboarding step 4 (spec §5): how often the agent runs, when, and how to notify. */
export function ScheduleStep() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const schedule = useQuery({
    queryKey: queryKeys.schedule,
    queryFn: ({ signal }) => callApi('getSchedule', { signal }),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const showSkeleton = useDelayedFlag(schedule.isPending);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Set your schedule</h2>
      <p className={styles.muted}>Choose when the agent looks for new matches. You can change this any time.</p>
      {schedule.isPending ? (
        showSkeleton ? (
          <div className={formStyles.form}>
            <Skeleton height={48} radius="12px" />
            <Skeleton height={64} radius="12px" />
            <Skeleton height={64} radius="12px" />
            <Skeleton height={96} radius="12px" />
          </div>
        ) : (
          <div style={{ height: 400 }} />
        )
      ) : schedule.isError ? (
        <p className={styles.muted} role="alert">
          We could not load your schedule. Reload the page to try again.
        </p>
      ) : (
        <ScheduleForm
          schedule={schedule.data}
          footer={
            <Link href={onboardingPath('set_targets')} className={formStyles.back}>
              Back
            </Link>
          }
          submitLabel="Finish setup"
          loadingLabel="Finishing..."
          onSaved={async () => {
            // POST /v1/onboarding/complete marks onboarding done and starts the master CV (worker); then 06 New CV.
            const me = await callApi('completeOnboarding');
            queryClient.setQueryData(queryKeys.me, me);
            router.push('/cvs/new');
          }}
        />
      )}
    </section>
  );
}
