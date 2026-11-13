'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { callApi } from '../../lib/api/api-client.ts';
import { queryKeys } from '../../lib/api/query-client.ts';
import { PageHeader } from '../shell/page-header.tsx';
import { Button } from '../ui/button.tsx';
import { Skeleton } from '../ui/skeleton.tsx';
import { CvStatusBadge } from '../ui/status-badge.tsx';
import { canEdit } from './cv-actions-menu.tsx';
import styles from './cv-detail.module.css';
import { CvDownloadButton } from './cv-download.tsx';
import { CvEditor } from './cv-editor.tsx';
import { CvPreview } from './cv-preview.tsx';

/** CV view ("View") and "Edit text" (`?edit=1`). */
export function CvDetail({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const editing = params.get('edit') === '1';
  const cv = useQuery({ queryKey: ['cv', id], queryFn: ({ signal }) => callApi('getCv', { params: { id }, signal }) });

  const setEditing = (on: boolean) => router.replace(on ? `/cvs/${id}?edit=1` : `/cvs/${id}`);

  if (cv.isPending) return <Skeleton height={600} radius="16px" />;
  if (cv.isError) return <p role="alert">This CV could not be loaded. It may have been deleted.</p>;

  const data = cv.data;
  return (
    <>
      <PageHeader
        title={`${data.fileBaseName}.pdf`}
        subtitle={
          <span className={styles.subtitle}>
            <CvStatusBadge status={data.status} />
            {data.kind === 'master' ? `Master CV v${data.version}` : 'Special CV for an application'}
          </span>
        }
        actions={
          !editing && (
            <>
              <Link href={`/cvs/${id}/compare`} className={styles.link}>
                {data.kind === 'special' ? 'Compare with master' : 'Compare with original'}
              </Link>
              {canEdit(data) && <Button onClick={() => setEditing(true)}>Edit text</Button>}
              <CvDownloadButton cvId={id} variant="primary" />
            </>
          )
        }
      />
      <Link href="/cvs" className={styles.back}>
        ← All CVs
      </Link>
      {!data.content ? (
        <p className={styles.muted}>This CV is still being written.</p>
      ) : editing && canEdit(data) ? (
        <CvEditor
          cvId={id}
          content={data.content}
          onDone={async (saved) => {
            if (saved) {
              await queryClient.invalidateQueries({ queryKey: ['cv', id] });
              await queryClient.invalidateQueries({ queryKey: queryKeys.cvs });
            }
            setEditing(false);
          }}
        />
      ) : (
        <div className={styles.preview}>
          <CvPreview content={data.content} />
        </div>
      )}
    </>
  );
}
