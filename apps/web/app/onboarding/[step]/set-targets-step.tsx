'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TargetsForm } from '../../../components/forms/targets-form.tsx';
import formStyles from '../../../components/forms/targets-form.module.css';
import { Skeleton, useDelayedFlag } from '../../../components/ui/skeleton.tsx';
import { callApi } from '../../../lib/api/api-client.ts';
import { queryKeys } from '../../../lib/api/query-client.ts';
import { onboardingPath } from '../../../lib/onboarding/steps.ts';
import styles from '../onboarding.module.css';

/** Onboarding step 3 (spec §5): roles, locations, work format, exclusions and what to look for. */
export function SetTargetsStep() {
  const router = useRouter();
  const targets = useQuery({
    queryKey: queryKeys.targets,
    queryFn: ({ signal }) => callApi('getTargets', { signal }),
    // The form owns its state after the first load.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const showSkeleton = useDelayedFlag(targets.isPending);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Set your targets</h2>
      <p className={styles.muted}>Tell us what to look for. You can change this any time.</p>
      {targets.isPending ? (
        showSkeleton ? (
          <div className={formStyles.form}>
            <Skeleton height={64} radius="12px" />
            <Skeleton height={64} radius="12px" />
            <Skeleton height={48} radius="12px" />
            <Skeleton height={64} radius="12px" />
          </div>
        ) : (
          <div style={{ height: 400 }} />
        )
      ) : targets.isError ? (
        <p className={styles.muted} role="alert">
          We could not load your targets. Reload the page to try again.
        </p>
      ) : (
        <TargetsForm
          targets={targets.data}
          footer={
            <Link href={onboardingPath('confirm_profile')} className={formStyles.back}>
              Back
            </Link>
          }
          onSaved={() => router.push(onboardingPath('schedule'))}
        />
      )}
    </section>
  );
}
