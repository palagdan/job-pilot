'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../lib/api/api-client.ts';
import { queryKeys } from '../../lib/api/query-client.ts';
import { uploadCvWithProgress } from '../../lib/api/upload-cv.ts';
import { Button } from '../ui/button.tsx';
import { ConfirmDialog, Modal } from '../ui/dialog.tsx';
import { Dropzone, type DropzoneState } from '../ui/dropzone.tsx';
import { toast } from '../ui/toast.tsx';

/**
 * "CVs > Upload new CV" (spec §1 CV file upload). When a CV exists, C04 "Replace your CV?" is asked first;
 * the profile is re-read from the new file (worker) and sent CVs stay as they are.
 */
export function UploadNewCv({ hasCv }: { hasCv: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const [state, setState] = useState<DropzoneState>({ kind: 'idle' });

  const upload = async (file: File) => {
    setPending(null);
    setState({ kind: 'uploading', filename: file.name, progress: 0 });
    try {
      await uploadCvWithProgress(file, {
        replace: hasCv,
        onProgress: (progress) => setState({ kind: 'uploading', filename: file.name, progress }),
      });
      setState({ kind: 'reading' });
      toast('CV uploaded. We are reading it now.');
      await queryClient.invalidateQueries({ queryKey: queryKeys.cvs });
      setOpen(false);
      setState({ kind: 'idle' });
    } catch (error) {
      setState({ kind: 'error', message: error instanceof ApiError ? error.message : 'Upload failed. Try again.' });
    }
  };

  return (
    <>
      <Button icon={<Upload />} onClick={() => setOpen(true)}>
        Upload new CV
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setState({ kind: 'idle' });
        }}
        title="Upload new CV"
        description="PDF or DOCX, up to 5 MB. We read it once to update your profile."
        actions={<Button onClick={() => setOpen(false)}>Close</Button>}
      >
        <Dropzone
          size="compact"
          state={state}
          onFile={(file) => (hasCv ? setPending(file) : void upload(file))}
          onReject={(message) => setState({ kind: 'error', message })}
        />
      </Modal>
      {/* C04 Replace CV */}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => !next && setPending(null)}
        title="Replace your CV?"
        description="Your profile is re-read and the master CV is written again. CVs that were already sent stay as they are."
        confirmLabel="Replace"
        onConfirm={() => (pending ? upload(pending) : undefined)}
      />
    </>
  );
}
