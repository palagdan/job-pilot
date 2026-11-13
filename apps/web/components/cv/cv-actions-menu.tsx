'use client';

import type { CvSummary } from '@job-pilot/shared/cv';
import type { FileFormat } from '@job-pilot/shared/enums';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, callApi } from '../../lib/api/api-client.ts';
import { queryKeys } from '../../lib/api/query-client.ts';
import { Button } from '../ui/button.tsx';
import { ConfirmDialog } from '../ui/dialog.tsx';
import { DropdownMenu, MenuItem, MenuSeparator } from '../ui/dropdown-menu.tsx';
import { toast } from '../ui/toast.tsx';
import { triggerDownload } from './cv-download.tsx';

/** The confirmed master in use cannot be deleted (spec "CV actions menu"). */
export const canDelete = (cv: CvSummary) => !(cv.kind === 'master' && cv.status === 'confirmed');
/** Edit and Regenerate are hidden for a sent CV; a CV still being written has nothing to edit. */
export const canEdit = (cv: CvSummary) => cv.status !== 'sent' && cv.status !== 'generating';

/**
 * Spec "CV actions menu": View, Edit text, Compare with master, Download (PDF default / DOCX), Regenerate, Delete (C05).
 */
export function CvActionsMenu({ cv }: { cv: CvSummary }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileName = `${cv.fileBaseName}.pdf`;

  const regenerate = useMutation({
    mutationFn: () => callApi('regenerateCv', { params: { id: cv.id } }),
    onSuccess: async () => {
      toast('Writing a new version. This takes about a minute.');
      await queryClient.invalidateQueries({ queryKey: queryKeys.cvs });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not start. Try again.'),
  });
  const remove = useMutation({
    mutationFn: () => callApi('deleteCv', { params: { id: cv.id } }),
    onSuccess: async () => {
      toast('CV deleted');
      await queryClient.invalidateQueries({ queryKey: queryKeys.cvs });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not delete. Try again.'),
  });

  const download = async (format: FileFormat) => {
    try {
      const { url, filename } = await callApi('downloadCv', { params: { id: cv.id }, query: { format } });
      triggerDownload(url, filename);
    } catch {
      toast.error('Download failed.', { retry: () => void download(format) });
    }
  };

  return (
    <>
      <DropdownMenu
        align="end"
        trigger={
          <Button variant="ghost" size="sm" aria-label={`Actions for ${fileName}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        }
      >
        <MenuItem onSelect={() => router.push(`/cvs/${cv.id}`)}>View</MenuItem>
        {canEdit(cv) && <MenuItem onSelect={() => router.push(`/cvs/${cv.id}?edit=1`)}>Edit text</MenuItem>}
        <MenuItem onSelect={() => router.push(`/cvs/${cv.id}/compare`)}>
          {cv.kind === 'special' ? 'Compare with master' : 'Compare with original'}
        </MenuItem>
        <MenuSeparator />
        <MenuItem description="Default" onSelect={() => void download('pdf')}>
          Download PDF
        </MenuItem>
        <MenuItem onSelect={() => void download('docx')}>Download DOCX</MenuItem>
        {canEdit(cv) && cv.kind === 'master' && (
          <MenuItem onSelect={() => regenerate.mutate()} disabled={regenerate.isPending}>
            Regenerate
          </MenuItem>
        )}
        {canDelete(cv) && (
          <>
            <MenuSeparator />
            <MenuItem tone="danger" onSelect={() => setConfirmDelete(true)}>
              Delete
            </MenuItem>
          </>
        )}
      </DropdownMenu>

      {/* C05 Delete CV */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title="Delete this CV?"
        description={
          cv.kind === 'special'
            ? `"${fileName}" will be deleted. The opportunity stays in your pipeline.`
            : `"${fileName}" will be deleted. Your confirmed master CV stays as it is.`
        }
        confirmLabel="Delete"
        onConfirm={() => remove.mutateAsync()}
      />
    </>
  );
}
