'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '../../lib/api/api-client.ts';
import { queryKeys } from '../../lib/api/query-client.ts';
import { Button } from '../ui/button.tsx';
import { ConfirmDialog, Modal } from '../ui/dialog.tsx';
import { Skeleton, useDelayedFlag } from '../ui/skeleton.tsx';
import { Spinner } from '../ui/spinner.tsx';
import { Badge, CvStatusBadge } from '../ui/status-badge.tsx';
import { toast } from '../ui/toast.tsx';
import { CvDownloadButton, triggerDownload } from './cv-download.tsx';
import { CvFileLabel } from './cv-file-label.tsx';
import { CvPreview } from './cv-preview.tsx';
import styles from './new-cv-review.module.css';
import { notifyError } from '../../lib/errors/notify-error.ts';

/**
 * 06 New CV — review and confirm (Figma "06 New CV - review and confirm").
 * The master CV is written by the worker after onboarding; this screen waits for it (polling), then lets the user
 * confirm it (C02) or keep the original upload (C03). Failure → E05.
 */
export function NewCvReview() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'confirm' | 'original' | null>(null);
  const [e05Dismissed, setE05Dismissed] = useState(false);

  const list = useQuery({
    queryKey: queryKeys.cvs,
    queryFn: ({ signal }) => callApi('listCvs', { signal }),
    // Poll while the worker is writing the CV.
    refetchInterval: (q) => (!q.state.data?.master || q.state.data.master.status === 'generating' ? 3000 : false),
  });
  const master = list.data?.master ?? null;
  const ready = master && master.status !== 'generating' && master.status !== 'failed';

  const detail = useQuery({
    queryKey: ['cv', master?.id, master?.updatedAt],
    queryFn: ({ signal }) => callApi('getCv', { params: { id: master?.id ?? '' }, signal }),
    enabled: Boolean(ready),
  });
  const showSkeleton = useDelayedFlag(list.isPending);

  const done = async (message: string) => {
    toast(message);
    await queryClient.invalidateQueries({ queryKey: queryKeys.cvs });
    router.push('/today');
  };

  const confirm = useMutation({
    mutationFn: () => callApi('confirmCv', { params: { id: master?.id ?? '' } }),
    onSuccess: () => done('CV confirmed'),
    onError: (e) => notifyError(e, 'Could not confirm the CV. Try again.'),
  });
  const keepOriginal = useMutation({
    mutationFn: () => callApi('keepOriginalCv'),
    onSuccess: () => done('Your original CV is in use'),
    onError: (e) => notifyError(e, 'Could not switch to your original CV. Try again.'),
  });
  const retry = useMutation({
    mutationFn: () => callApi('regenerateCv', { params: { id: master?.id ?? '' } }),
    onSuccess: async () => {
      setE05Dismissed(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.cvs });
    },
    onError: (e) => notifyError(e, 'Could not start again. Try again in a moment.'),
  });

  const downloadOriginal = async () => {
    if (!list.data?.original) return;
    try {
      const { url, filename } = await callApi('downloadOriginal', { params: { id: list.data.original.uploadId } });
      triggerDownload(url, filename);
    } catch {
      toast.error('Download failed.');
    }
  };

  if (list.isPending) {
    return showSkeleton ? (
      <div className={styles.columns}>
        <Skeleton height={640} radius="16px" />
        <Skeleton height={360} radius="16px" />
      </div>
    ) : null;
  }
  if (list.isError) {
    return (
      <p className={styles.muted} role="alert">
        We could not load your CV. Reload the page to try again.
      </p>
    );
  }

  // Not written yet (spec §10 "Writing a CV").
  if (!master || master.status === 'generating') {
    return (
      <section className={styles.writing} aria-live="polite">
        <Spinner size={22} />
        <h1>Writing your new CV...</h1>
        <p className={styles.muted}>Usually under a minute. You can leave this page - we will email you when it is ready.</p>
      </section>
    );
  }

  // E05 New CV generation failed.
  if (master.status === 'failed') {
    return (
      <>
        <section className={styles.writing}>
          <h1>Your new CV is not ready yet</h1>
          <p className={styles.muted}>Something went wrong while writing it. Your profile is saved, nothing is lost.</p>
          <div className={styles.row}>
            <Button onClick={() => keepOriginal.mutate()} loading={keepOriginal.isPending}>
              Use my original
            </Button>
            <Button variant="primary" onClick={() => retry.mutate()} loading={retry.isPending}>
              Try again
            </Button>
          </div>
        </section>
        <Modal
          open={!e05Dismissed}
          onOpenChange={(open) => !open && setE05Dismissed(true)}
          title="Your new CV is not ready yet"
          description="Something went wrong while writing it. Your profile is saved, nothing is lost."
          actions={
            <>
              <Button onClick={() => keepOriginal.mutate()} loading={keepOriginal.isPending}>
                Use my original
              </Button>
              <Button variant="primary" onClick={() => retry.mutate()} loading={retry.isPending}>
                Try again
              </Button>
            </>
          }
        />
      </>
    );
  }

  const confirmed = master.status === 'confirmed';
  const pages = master.pageCount ? ` - ${master.pageCount} ${master.pageCount === 1 ? 'page' : 'pages'}` : '';

  return (
    <>
      <header className={styles.header}>
        <div className={styles.row}>
          <Badge tone="success">
            <Check aria-hidden="true" className={styles.icon} /> Setup complete
          </Badge>
          <Badge>New file created</Badge>
        </div>
        <h1>Your new CV is ready</h1>
        <p className={styles.muted}>
          JobPilot rewrote your CV from your profile. Review it and confirm - it becomes the base for every application.
        </p>
      </header>

      <div className={styles.columns}>
        <section className={styles.card} aria-label="New CV file">
          <div className={styles.fileHead}>
            <CvFileLabel
              name={`${master.fileBaseName}.pdf`}
              meta={`Created by JobPilot${pages}`}
              badges={
                <>
                  {!confirmed && <Badge>New</Badge>}
                  <CvStatusBadge status={master.status} />
                </>
              }
            />
            <CvDownloadButton cvId={master.id} />
          </div>
          {detail.data?.content ? (
            <CvPreview content={detail.data.content} />
          ) : (
            <Skeleton height={560} radius="10px" />
          )}
        </section>

        <aside className={styles.side}>
          {master.changes.length > 0 && (
            <section className={styles.card}>
              <h2>What changed</h2>
              <ul className={styles.changes}>
                {master.changes.map((c) => (
                  <li key={c}>
                    <Check aria-hidden="true" className={styles.check} />
                    {c}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {list.data.original && (
            <section className={styles.card}>
              <h2>Your original</h2>
              <CvFileLabel name={list.data.original.filename} meta="Uploaded during setup - kept unchanged" />
              <Button variant="ghost" size="sm" onClick={() => void downloadOriginal()}>
                Download original
              </Button>
            </section>
          )}

          <section className={styles.actions}>
            {confirmed ? (
              <Button variant="primary" onClick={() => router.push('/today')}>
                Open Today
              </Button>
            ) : (
              <>
                <Button variant="primary" onClick={() => setDialog('confirm')}>
                  Confirm and use this CV
                </Button>
                <Button variant="ghost" onClick={() => setDialog('original')}>
                  Keep my original instead
                </Button>
              </>
            )}
            <p className={styles.note}>The agent does not send anything until you confirm a CV.</p>
          </section>
        </aside>
      </div>

      {/* C02 Confirm new CV */}
      <ConfirmDialog
        open={dialog === 'confirm'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Use this CV for applications?"
        description="It becomes your master CV. You can edit or replace it later in CVs."
        cancelLabel="Back"
        confirmLabel="Confirm"
        onConfirm={() => confirm.mutateAsync()}
      />
      {/* C03 Keep original CV */}
      <ConfirmDialog
        open={dialog === 'original'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Use your original CV?"
        description="The agent will build applications from your uploaded file. It may pass ATS filters less often."
        cancelLabel="Back"
        confirmLabel="Use original"
        onConfirm={() => keepOriginal.mutateAsync()}
      />
    </>
  );
}
