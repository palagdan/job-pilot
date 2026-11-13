'use client';

import type { CvSummary } from '@job-pilot/shared/cv';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { callApi } from '../../lib/api/api-client.ts';
import { queryKeys } from '../../lib/api/query-client.ts';
import { reviewPath } from '../pipeline/pipeline-labels.ts';
import { PageHeader } from '../shell/page-header.tsx';
import { Banner } from '../ui/banner.tsx';
import { Button } from '../ui/button.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Skeleton, useDelayedFlag } from '../ui/skeleton.tsx';
import { Badge, CvStatusBadge } from '../ui/status-badge.tsx';
import { CvActionsMenu } from './cv-actions-menu.tsx';
import { CvDownloadButton } from './cv-download.tsx';
import { CvFileLabel } from './cv-file-label.tsx';
import styles from './cvs-page.module.css';
import { UploadNewCv } from './upload-new-cv.tsx';

const shortDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso)) : '';

const changesLabel = (n: number) => (n === 1 ? '1 change' : `${n} changes`);

/** Special CV status line (Figma 09: "New - based on Master v1 - 4 changes", "Based on Master v1 - 3 changes"). */
const specialMeta = (cv: CvSummary) => {
  if (cv.status === 'generating') return 'Being written for this application';
  if (cv.status === 'failed') return 'Could not be written - open the application to try again';
  const basedOn = cv.basedOnVersion ? `based on Master v${cv.basedOnVersion}` : 'based on your master CV';
  return [
    cv.status === 'ready_to_send' ? `New - ${basedOn}` : basedOn.replace(/^b/, 'B'),
    cv.changes.length ? changesLabel(cv.changes.length) : null,
  ]
    .filter(Boolean)
    .join(' - ');
};

/** Buttons of a special CV row: Review while it waits to be sent (Figma primary), View after. */
function SpecialActions({ cv }: { cv: CvSummary }) {
  const router = useRouter();
  if (cv.status === 'generating') return null;
  const review = cv.pipelineItemId ? reviewPath(cv.pipelineItemId) : null;
  if (cv.status === 'failed') {
    return review ? <Button size="sm" onClick={() => router.push(review)}>Open</Button> : null;
  }
  return (
    <>
      <Link href={`/cvs/${cv.id}/compare`} className={styles.link}>
        Compare
      </Link>
      {cv.status === 'ready_to_send' && review ? (
        <Button size="sm" variant="primary" onClick={() => router.push(review)}>
          Review
        </Button>
      ) : (
        <Button size="sm" onClick={() => router.push(`/cvs/${cv.id}`)}>
          View
        </Button>
      )}
      <CvActionsMenu cv={cv} />
    </>
  );
}

/** 09 CVs — master CV, original upload, special CVs for applications. */
export function CvsPage() {
  const list = useQuery({
    queryKey: queryKeys.cvs,
    queryFn: ({ signal }) => callApi('listCvs', { signal }),
    refetchInterval: (q) => (q.state.data?.master?.status === 'generating' ? 4000 : false),
  });
  const showSkeleton = useDelayedFlag(list.isPending);
  const master = list.data?.master ?? null;

  return (
    <>
      <PageHeader
        title="CVs"
        subtitle="Your master CV and the special versions made for each application"
        actions={list.data && <UploadNewCv hasCv={Boolean(list.data.original)} />}
      />

      {master?.status === 'needs_review' && (
        <Banner title="A new CV was created for you" action={{ label: 'Review CV', href: '/cvs/new' }}>
          Review and confirm it. The agent prepares application packs only after you do.
        </Banner>
      )}
      {master?.status === 'failed' && (
        <Banner tone="danger" title="Your new CV is not ready yet" action={{ label: 'Open', href: '/cvs/new' }}>
          Something went wrong while writing it. Your profile is saved, nothing is lost.
        </Banner>
      )}

      {list.isPending ? (
        showSkeleton && (
          <div className={styles.stack}>
            <Skeleton height={150} radius="16px" />
            <Skeleton height={220} radius="16px" />
          </div>
        )
      ) : list.isError ? (
        <p role="alert">We could not load your CVs. Reload the page to try again.</p>
      ) : (
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="master-title">
            <h2 id="master-title">Master CV</h2>
            {master ? (
              <>
                <div className={styles.fileRow}>
                  <CvFileLabel
                    name={`${master.fileBaseName}.pdf`}
                    meta={
                      master.origin === 'original'
                        ? 'Your original CV - base for every special CV'
                        : 'Created by JobPilot - base for every special CV'
                    }
                    badges={master.status === 'generating' ? <Badge tone="neutral">Generating</Badge> : <CvStatusBadge status={master.status} />}
                  />
                  <div className={styles.fileActions}>
                    {master.status !== 'generating' && master.status !== 'failed' && (
                      <>
                        <Link href={`/cvs/${master.id}/compare`} className={styles.link}>
                          Compare
                        </Link>
                        <CvDownloadButton cvId={master.id} />
                        <CvActionsMenu cv={master} />
                      </>
                    )}
                  </div>
                </div>
                {list.data.original && (
                  <p className={styles.muted}>Original upload: {list.data.original.filename} - kept unchanged</p>
                )}
              </>
            ) : (
              <EmptyState
                title="No master CV yet"
                description="Upload your CV and finish setup - JobPilot writes your master CV from it."
                action={<UploadNewCv hasCv={Boolean(list.data.original)} />}
              />
            )}
          </section>

          <section className={styles.card} aria-labelledby="special-title">
            <div className={styles.sectionHead}>
              <div>
                <h2 id="special-title">Special CVs for applications</h2>
                <p className={styles.muted}>A separate file for each application, built from the master CV</p>
              </div>
              {list.data.special.length > 0 && <Badge tone="neutral">{list.data.special.length === 1 ? '1 file' : `${list.data.special.length} files`}</Badge>}
            </div>
            {list.data.special.length === 0 ? (
              <EmptyState title="No special CVs yet" description="A separate CV is written for every application you pursue." />
            ) : (
              <ul className={styles.list}>
                {list.data.special.map((cv) => (
                  <li key={cv.id} className={styles.fileRow}>
                    <CvFileLabel
                      name={`${cv.fileBaseName}.pdf`}
                      meta={specialMeta(cv)}
                      badges={
                        cv.status === 'sent' ? (
                          <Badge>Sent {shortDate(cv.sentAt)}</Badge>
                        ) : (
                          <CvStatusBadge status={cv.status} />
                        )
                      }
                    />
                    <div className={styles.fileActions}>
                      <SpecialActions cv={cv} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
