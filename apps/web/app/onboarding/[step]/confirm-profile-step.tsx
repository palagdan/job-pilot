'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProfileForm } from '../../../components/forms/profile-form.tsx';
import formStyles from '../../../components/forms/profile-form.module.css';
import { Skeleton, useDelayedFlag } from '../../../components/ui/skeleton.tsx';
import { callApi } from '../../../lib/api/api-client.ts';
import { queryKeys } from '../../../lib/api/query-client.ts';
import { onboardingPath } from '../../../lib/onboarding/steps.ts';
import styles from '../onboarding.module.css';

/** Onboarding step 2 (spec §5): confirm the profile pre-filled from the CV, then Continue to targets. */
export function ConfirmProfileStep() {
  const router = useRouter();
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: ({ signal }) => callApi('getProfile', { signal }),
    // The form owns its state after the first load; refetching must not overwrite edits.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const showSkeleton = useDelayedFlag(profile.isPending);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Confirm your profile</h2>
      <p className={styles.muted}>We pre-filled this from your CV. Check it and fix anything that is off.</p>
      {profile.isPending ? (
        showSkeleton ? (
          <div className={formStyles.form}>
            <Skeleton height={64} radius="12px" />
            <Skeleton height={64} radius="12px" />
            <Skeleton height={64} radius="12px" />
            <Skeleton height={120} radius="12px" />
          </div>
        ) : (
          <div style={{ height: 400 }} />
        )
      ) : profile.isError ? (
        <p className={styles.muted} role="alert">
          We could not load your profile. Reload the page to try again.
        </p>
      ) : (
        <ProfileForm
          profile={profile.data}
          footer={
            <Link href={onboardingPath('upload')} className={formStyles.back}>
              Back
            </Link>
          }
          onSaved={() => router.push(onboardingPath('set_targets'))}
        />
      )}
    </section>
  );
}
