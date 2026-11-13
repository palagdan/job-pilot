'use client';

import type { FileFormat } from '@job-pilot/shared/enums';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { callApi } from '../../lib/api/api-client.ts';
import { Button } from '../ui/button.tsx';
import { Modal } from '../ui/dialog.tsx';
import { MenuItem } from '../ui/dropdown-menu.tsx';
import { SplitButton } from '../ui/split-button.tsx';
import { toast } from '../ui/toast.tsx';

/** Starts a browser download of a same-origin or signed URL with the given file name. */
export const triggerDownload = (url: string, filename: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
};

/**
 * "Download" with the format menu (spec "Download format": PDF default, DOCX).
 * A failed PDF opens E08 "Could not download the CV" with Download DOCX / Try again.
 */
export function CvDownloadButton({ cvId, variant = 'secondary' }: { cvId: string; variant?: 'primary' | 'secondary' }) {
  const [busy, setBusy] = useState<FileFormat | null>(null);
  const [failed, setFailed] = useState(false);

  const download = async (format: FileFormat) => {
    setBusy(format);
    setFailed(false);
    try {
      const { url, filename } = await callApi('downloadCv', { params: { id: cvId }, query: { format } });
      triggerDownload(url, filename);
    } catch {
      if (format === 'pdf') setFailed(true);
      else toast.error('Download failed.', { retry: () => void download(format) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <SplitButton
        variant={variant}
        onClick={() => void download('pdf')}
        disabled={busy !== null}
        menuLabel="Download format"
        menu={
          <>
            <MenuItem description="Default" onSelect={() => void download('pdf')}>
              PDF
            </MenuItem>
            <MenuItem onSelect={() => void download('docx')}>DOCX</MenuItem>
          </>
        }
      >
        <Download aria-hidden="true" />
        {busy ? 'Preparing...' : 'Download'}
      </SplitButton>

      {/* E08 Download failed */}
      <Modal
        open={failed}
        onOpenChange={setFailed}
        title="Could not download the CV"
        description="The file was not created. Try again or download it as DOCX."
        actions={
          <>
            <Button onClick={() => void download('docx')} loading={busy === 'docx'}>
              Download DOCX
            </Button>
            <Button variant="primary" onClick={() => void download('pdf')} loading={busy === 'pdf'}>
              Try again
            </Button>
          </>
        }
      />
    </>
  );
}
