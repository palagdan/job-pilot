'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageHeader } from '../../../components/shell/page-header.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { EmptyState } from '../../../components/ui/empty-state.tsx';
import { Skeleton, useDelayedFlag } from '../../../components/ui/skeleton.tsx';
import styles from './review.module.css';
import { useReviewList } from './use-review.ts';

/** /review: opens the first item waiting for review, or shows the empty state. */
export function ReviewIndex() {
  const router = useRouter();
  const list = useReviewList();
  const first = list.data?.items[0];
  const showSkeleton = useDelayedFlag(list.isPending || Boolean(first));

  useEffect(() => {
    if (first) router.replace(`/review/${first.id}`);
  }, [first, router]);

  if (list.isError) {
    return (
      <>
        <PageHeader title="Review" subtitle="Packs waiting for you to send" />
        <EmptyState
          title="Could not load Review"
          description="Check your connection and try again."
          action={<Button onClick={() => void list.refetch()}>Try again</Button>}
        />
      </>
    );
  }
  if (list.isPending || first) {
    return (
      <>
        <PageHeader title="Review" subtitle="Packs waiting for you to send" />
        {showSkeleton ? (
          <div className={styles.skeleton} aria-label="Loading">
            <Skeleton width="50%" height={24} />
            <Skeleton height={96} />
            <Skeleton height={160} />
          </div>
        ) : (
          <div style={{ height: 320 }} />
        )}
      </>
    );
  }
  return (
    <>
      <PageHeader title="Review" subtitle="Packs waiting for you to send" />
      <EmptyState title="No drafts to review" description="Press Pursue on an opportunity in Today and its drafts appear here." />
    </>
  );
}
