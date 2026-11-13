'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { callApi } from '../../lib/api/api-client.ts';
import { PageHeader } from '../shell/page-header.tsx';
import { Skeleton } from '../ui/skeleton.tsx';
import styles from './cv-compare.module.css';
import { CvPreview, cvLines } from './cv-preview.tsx';

/**
 * "Compare with master" / master "Compare" (with the original upload): side by side, lines only on the left are
 * marked removed, lines only on the right added.
 */
export function CvCompare({ id, withId }: { id: string; withId?: string }) {
  const compare = useQuery({
    queryKey: ['cv-compare', id, withId],
    queryFn: ({ signal }) => callApi('compareCv', { params: { id }, query: withId ? { with: withId } : {}, signal }),
  });

  if (compare.isPending) return <Skeleton height={600} radius="16px" />;
  if (compare.isError) return <p role="alert">{compare.error.message}</p>;

  const { base, other } = compare.data;
  const baseLines = base.content ? cvLines(base.content) : new Set<string>();
  const otherLines = other.content ? cvLines(other.content) : new Set<string>();
  const baseLabel = base.origin === 'original' && base.version === 0 ? 'Your original upload' : `${base.fileBaseName}.pdf`;

  return (
    <>
      <PageHeader title="Compare CVs" subtitle={`${baseLabel} → ${other.fileBaseName}.pdf`} />
      <Link href={`/cvs/${id}`} className={styles.back}>
        ← Back to the CV
      </Link>
      <p className={styles.legend}>
        <span data-mark="removed">Removed</span> <span data-mark="added">Added or rewritten</span>
      </p>
      <div className={styles.columns}>
        <section aria-label={baseLabel}>
          <h2 className={styles.columnTitle}>{baseLabel}</h2>
          {base.content && <CvPreview content={base.content} mark={(l) => (otherLines.has(l) ? undefined : 'removed')} />}
        </section>
        <section aria-label={`${other.fileBaseName}.pdf`}>
          <h2 className={styles.columnTitle}>{other.fileBaseName}.pdf</h2>
          {other.content && <CvPreview content={other.content} mark={(l) => (baseLines.has(l) ? undefined : 'added')} />}
        </section>
      </div>
    </>
  );
}
