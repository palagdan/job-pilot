'use client';

import type { Draft } from '@job-pilot/shared/draft';
import type { Review } from '@job-pilot/shared/review';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { CvDownloadButton, triggerDownload } from '../../../components/cv/cv-download.tsx';
import { PageHeader } from '../../../components/shell/page-header.tsx';
import { Banner } from '../../../components/ui/banner.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { ConfirmDialog, Modal } from '../../../components/ui/dialog.tsx';
import { EmptyState } from '../../../components/ui/empty-state.tsx';
import { Skeleton, useDelayedFlag } from '../../../components/ui/skeleton.tsx';
import { Spinner } from '../../../components/ui/spinner.tsx';
import { PipelineStatusBadge } from '../../../components/ui/status-badge.tsx';
import { toast } from '../../../components/ui/toast.tsx';
import { ApiError, callApi } from '../../../lib/api/api-client.ts';
import { notifyError } from '../../../lib/errors/notify-error.ts';
import { copyText } from './copy-text.ts';
import { DraftCard } from './draft-card.tsx';
import { FollowUpsSection } from './follow-ups-section.tsx';
import styles from './review.module.css';
import { reviewKeys, useReview, useReviewList } from './use-review.ts';

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const eventDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const copyAllText = (drafts: Draft[]) =>
  drafts.map((d) => (d.kind === 'cover_text' || !d.label ? d.body : `${d.label}\n${d.body}`)).join('\n\n');

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className={styles.step}>
      <span className={styles.stepNumber} aria-hidden="true">
        {n}
      </span>
      <div className={styles.stepBody}>
        <h3 className={styles.stepTitle}>
          <span className={styles.srOnly}>Step {n}: </span>
          {title}
        </h3>
        <div className={styles.stepActions}>{children}</div>
      </div>
    </li>
  );
}

/** 08 Review (spec §8.3) for one pipeline item. */
export function ReviewItem({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const review = useReview(id);
  const list = useReviewList();
  const showSkeleton = useDelayedFlag(review.isPending);
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(new Set());
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [confirmDone, setConfirmDone] = useState(false);
  const [deadPage, setDeadPage] = useState(false);
  const dirty = dirtyIds.size > 0;

  const onDirtyChange = useCallback((draftId: string, isDirty: boolean) => {
    setDirtyIds((prev) => {
      if (prev.has(draftId) === isDirty) return prev;
      const next = new Set(prev);
      if (isDirty) next.add(draftId);
      else next.delete(draftId);
      return next;
    });
  }, []);

  // C08: browser close / reload, and in-app links (sidebar, prev/next) while a draft has unsaved edits.
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    const intercept = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const anchor = (e.target as Element | null)?.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(url.pathname + url.search);
    };
    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, []);

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: reviewKeys.all }), queryClient.invalidateQueries({ queryKey: ['today'] }), queryClient.invalidateQueries({ queryKey: ['pipeline'] })]);

  const patchDraft = (saved: Draft) =>
    queryClient.setQueryData<Review>(
      reviewKeys.item(id),
      (old) =>
        old && {
          ...old,
          drafts: old.drafts.map((d) => (d.id === saved.id ? saved : d)),
          followUps: old.followUps.map((f) => (f.draft?.id === saved.id ? { ...f, draft: saved } : f)),
        },
    );

  const undo = useMutation({
    mutationFn: (token: string) => callApi('undo', { body: { undoToken: token } }),
    onSuccess: () => {
      toast('Undone');
      void refresh();
    },
    onError: (e) => {
      notifyError(e, 'Could not undo.');
      void refresh();
    },
  });

  const data = review.data;
  const isEvent = data?.item.type === 'event';
  const markDone = useMutation({
    mutationFn: () => callApi(isEvent ? 'markRegistered' : 'markSent', { params: { id } }),
    onSuccess: async ({ undoToken, nextFollowUpAt }) => {
      await refresh();
      const followUp = nextFollowUpAt ? ` — follow-up on ${shortDate.format(new Date(nextFollowUpAt))}` : '';
      toast(`${isEvent ? 'Marked as registered' : 'Marked as sent'}${followUp}`, { undo: () => undo.mutate(undoToken) });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'conflict') {
        toast.error(e.message);
        void refresh();
      } else notifyError(e, 'Could not save. Check your connection.', { retry: () => markDone.mutate() });
    },
  });

  const notSent = useMutation({
    mutationFn: () => callApi('markNotSent', { params: { id } }),
    onSuccess: () => {
      toast('Marked as not sent');
      void refresh();
    },
    onError: (e) => notifyError(e, 'Could not save. Check your connection.', { retry: () => notSent.mutate() }),
  });

  const go = (href: string) => {
    if (dirty) setLeaveTo(href);
    else router.push(href);
  };

  if (review.isPending) {
    return (
      <>
        <PageHeader title="Review" />
        {showSkeleton ? (
          <div className={styles.skeleton} aria-label="Loading">
            <Skeleton width="50%" height={24} />
            <Skeleton height={96} />
            <Skeleton height={160} />
            <Skeleton height={160} />
          </div>
        ) : (
          <div style={{ height: 320 }} />
        )}
      </>
    );
  }
  if (review.isError || !data) {
    const missing = review.error instanceof ApiError && review.error.code === 'not_found';
    return (
      <>
        <PageHeader title="Review" />
        <EmptyState
          title={missing ? 'This application was not found' : 'Could not load Review'}
          description={missing ? 'It may have been removed.' : 'Check your connection and try again.'}
          action={
            missing ? (
              <Button onClick={() => router.push('/review')}>Back to Review</Button>
            ) : (
              <Button onClick={() => void review.refetch()}>Try again</Button>
            )
          }
        />
      </>
    );
  }

  const { item, drafts, specialCv, followUps } = data;
  const items = list.data?.items ?? [];
  const index = items.findIndex((i) => i.id === id);
  const prev = index > 0 ? items[index - 1] : undefined;
  const next = index >= 0 ? items[index + 1] : items[0];
  const waiting = item.status === 'ready_to_send';
  const done = item.status === 'sent' || item.status === 'registered';
  const heading = item.company ? `${item.title} — ${item.company}` : item.title;
  const routeLabel = isEvent ? 'Via event' : 'Direct';
  const doneAt = item.sentAt ?? item.registeredAt;

  const openPage = () => {
    if (data.postingUnavailable) setDeadPage(true);
    else window.open(data.url, '_blank', 'noopener,noreferrer');
  };

  const nav = items.length > 0 && (
    <nav className={styles.nav} aria-label="Items waiting for review">
      {index >= 0 && (
        <span className={styles.navCount}>
          {index + 1} of {items.length}
        </span>
      )}
      <Button size="sm" icon={<ChevronLeft aria-hidden="true" size={14} />} disabled={!prev} disabledReason="This is the first item" onClick={() => prev && go(`/review/${prev.id}`)}>
        Previous
      </Button>
      <Button size="sm" disabled={!next} disabledReason="No more items waiting" onClick={() => next && go(`/review/${next.id}`)}>
        Next <ChevronRight aria-hidden="true" size={14} />
      </Button>
    </nav>
  );

  const header = (
    <PageHeader
      title={heading}
      subtitle={
        <span className={styles.subtitle}>
          {routeLabel} · {isEvent && item.eventStartsAt ? eventDate.format(new Date(item.eventStartsAt)) : data.sourceName}
          {data.location && ` · ${data.location}`} <PipelineStatusBadge status={item.status} />
        </span>
      }
      actions={nav || undefined}
    />
  );

  if (item.status === 'preparing') {
    return (
      <>
        {header}
        <output className={styles.preparing}>
          <Spinner size={16} /> Preparing your pack… This takes about a minute. You can leave this page.
        </output>
      </>
    );
  }
  if (item.status === 'failed' || item.status === 'skipped') {
    return (
      <>
        {header}
        <EmptyState
          title={item.status === 'failed' ? 'We could not prepare this application' : 'You stopped pursuing this'}
          description={item.status === 'failed' ? 'Skip it for now or try again from Today.' : 'It is closed in your pipeline.'}
          action={
            <Button onClick={() => router.push('/review')}>Back to Review</Button>
          }
        />
      </>
    );
  }

  const allDrafts = copyAllText(drafts);

  return (
    <>
      {header}

      {item.status === 'no_reply' && (
        <Banner tone="warning" title="No reply">
          Two follow-ups went unanswered. Try another route, for example a direct message to the hiring manager or a recruiter.
        </Banner>
      )}
      {done && (
        <Banner tone="info" title={item.status === 'sent' ? `Sent on ${doneAt ? shortDate.format(new Date(doneAt)) : ''}` : `Registered on ${doneAt ? shortDate.format(new Date(doneAt)) : ''}`}>
          {item.nextFollowUpAt ? `We will remind you to follow up on ${shortDate.format(new Date(item.nextFollowUpAt))}.` : 'Nothing more to do here.'}
        </Banner>
      )}

      <div className={styles.layout}>
        <section className={styles.main} aria-label="Steps">
          {waiting && (
            <ol className={styles.steps}>
              {isEvent ? (
                <>
                  <Step n={1} title="Open the event page">
                    <Button icon={<ExternalLink aria-hidden="true" size={16} />} onClick={openPage}>
                      Open event page
                    </Button>
                  </Step>
                  <Step n={2} title="Add it to your calendar">
                    <Button icon={<CalendarPlus aria-hidden="true" size={16} />} onClick={() => triggerDownload(`/v1/pipeline/${id}/event.ics`, 'event.ics')}>
                      Add to calendar (.ics)
                    </Button>
                  </Step>
                  <Step n={3} title="Register on the event page, then confirm here">
                    <Button variant="primary" onClick={() => setConfirmDone(true)} loading={markDone.isPending}>
                      I registered
                    </Button>
                  </Step>
                </>
              ) : (
                <>
                  <Step n={1} title="Download your CV for this job">
                    {specialCv ? <CvDownloadButton cvId={specialCv.id} /> : <span className={styles.muted}>No tailored CV was prepared for this job.</span>}
                  </Step>
                  <Step n={2} title="Copy the texts below into the application form">
                    <Button icon={<Copy aria-hidden="true" size={16} />} onClick={() => void copyText(allDrafts, 'All texts copied')} disabled={drafts.length === 0}>
                      Copy all
                    </Button>
                  </Step>
                  <Step n={3} title="Open the application page">
                    <Button icon={<ExternalLink aria-hidden="true" size={16} />} onClick={openPage}>
                      Open page
                    </Button>
                  </Step>
                  <Step n={4} title="Send it, then confirm here">
                    <Button variant="primary" onClick={() => setConfirmDone(true)} loading={markDone.isPending}>
                      I sent it
                    </Button>
                  </Step>
                </>
              )}
            </ol>
          )}
          {done && (
            <div className={styles.doneActions}>
              <Button onClick={() => notSent.mutate()} loading={notSent.isPending}>
                {item.status === 'sent' ? 'Mark as not sent' : 'Mark as not registered'}
              </Button>
              <Button variant="ghost" onClick={() => go('/pipeline')}>
                Open Pipeline
              </Button>
            </div>
          )}

          {!isEvent && (
            <FollowUpsSection item={item} followUps={followUps} onDirtyChange={onDirtyChange} onSaved={patchDraft} onReload={() => review.refetch()} onChanged={refresh} onUndo={(token) => undo.mutate(token)} />
          )}

          <h2 className={styles.sectionTitle}>{isEvent ? 'Preparation notes' : 'Your texts'}</h2>
          {drafts.length === 0 ? (
            <p className={styles.muted}>No drafts for this application.</p>
          ) : (
            <ul className={styles.drafts}>
              {drafts.map((d) => (
                <DraftCard key={d.id} draft={d} onDirtyChange={onDirtyChange} onSaved={patchDraft} onReload={() => review.refetch()} />
              ))}
            </ul>
          )}
        </section>

        {specialCv && (
          <aside className={styles.side} aria-label="What changed in your CV">
            <h2 className={styles.sectionTitle}>What changed in your CV</h2>
            {specialCv.changes.length === 0 ? (
              <p className={styles.muted}>Your master CV was used as is.</p>
            ) : (
              <ul className={styles.changes}>
                {specialCv.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
            <Link className={styles.sideLink} href={`/cvs/${specialCv.id}`}>
              View or edit this CV
            </Link>
          </aside>
        )}
      </div>

      {/* C01 */}
      <ConfirmDialog
        open={confirmDone}
        onOpenChange={setConfirmDone}
        title={isEvent ? 'Did you register for this event?' : 'Did you send this application?'}
        description={isEvent ? 'We will mark it as registered.' : 'We will mark it as sent and remind you to follow up in 5 days.'}
        cancelLabel="Not yet"
        confirmLabel={isEvent ? 'Yes, I registered' : 'Yes, I sent it'}
        onConfirm={() => markDone.mutateAsync().catch(() => undefined)}
      />

      {/* E07 */}
      <Modal
        open={deadPage}
        onOpenChange={setDeadPage}
        title="This page is no longer available"
        description={isEvent ? 'The event was cancelled or the page was removed.' : 'The job was probably filled or taken down. You can try the link anyway.'}
        actions={
          <>
            <Button onClick={() => window.open(data.url, '_blank', 'noopener,noreferrer')}>Try the link anyway</Button>
            <Button variant="primary" onClick={() => setDeadPage(false)}>
              OK
            </Button>
          </>
        }
      />

      {/* C08 */}
      <ConfirmDialog
        open={leaveTo !== null}
        onOpenChange={(open) => !open && setLeaveTo(null)}
        tone="danger"
        title="Leave without saving?"
        description="Your changes on this page will be lost."
        cancelLabel="Stay"
        confirmLabel="Discard changes"
        onConfirm={() => {
          const target = leaveTo;
          setLeaveTo(null);
          setDirtyIds(new Set());
          if (target) router.push(target);
        }}
      />
    </>
  );
}
