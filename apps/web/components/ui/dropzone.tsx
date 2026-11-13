'use client';

import { limits, messages } from '@job-pilot/shared/limits';
import { FileText, UploadCloud } from 'lucide-react';
import { type DragEvent, useId, useRef, useState } from 'react';
import styles from './dropzone.module.css';

export type DropzoneState =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string; progress: number }
  | { kind: 'reading' }
  | { kind: 'done'; filename: string; pageCount: number | null }
  | { kind: 'error'; message: string };

/** Client-side check before uploading (the api checks again). Returns the spec's error copy or null. */
export const checkCvFile = (file: File): string | null => {
  const name = file.name.toLowerCase();
  const typeOk =
    (limits.cvUpload.mimeTypes as readonly string[]).includes(file.type) ||
    limits.cvUpload.extensions.some((ext) => name.endsWith(ext));
  if (!typeOk) return messages.cvWrongType;
  if (file.size > limits.cvUpload.maxBytes) return messages.cvTooLarge;
  return null;
};

/**
 * CV dropzone (spec §4 "CV dropzone"): idle, drag over, uploading %, reading, done (+ Replace file), error.
 * Controlled: the parent owns `state` and does the upload in `onFile`. Invalid files go to `onReject`.
 */
export function Dropzone({
  state,
  onFile,
  onReject,
  size = 'large',
}: {
  state: DropzoneState;
  onFile: (file: File) => void;
  onReject: (message: string) => void;
  /** large: onboarding (150 px, icon); compact: CVs page / spec. */
  size?: 'large' | 'compact';
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const busy = state.kind === 'uploading' || state.kind === 'reading';

  const take = (file: File | undefined) => {
    if (!file || busy) return;
    const problem = checkCvFile(file);
    if (problem) onReject(problem);
    else onFile(file);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    take(event.dataTransfer.files[0]);
  };

  const browse = () => input.current?.click();
  const visual = dragOver ? 'dragover' : state.kind;

  return (
    <div
      className={styles.zone}
      data-state={visual}
      data-size={size}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={input}
        id={inputId}
        type="file"
        className={styles.input}
        accept={[...limits.cvUpload.extensions, ...limits.cvUpload.mimeTypes].join(',')}
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
        tabIndex={-1}
        aria-hidden="true"
      />

      {visual === 'dragover' && <p className={styles.title}>Drop the file to upload</p>}

      {visual === 'idle' && (
        <>
          {size === 'large' && <UploadCloud className={styles.icon} aria-hidden="true" />}
          <p className={styles.title}>
            Drop your CV here or{' '}
            <button type="button" className={styles.link} onClick={browse}>
              browse
            </button>
          </p>
          <p className={styles.hint}>PDF or DOCX, up to 5 MB</p>
        </>
      )}

      {state.kind === 'uploading' && !dragOver && (
        <>
          <p className={styles.title} aria-live="polite">
            Uploading {state.filename}... {Math.round(state.progress)}%
          </p>
          <progress className={styles.progress} max={100} value={Math.round(state.progress)} aria-label="Upload progress" />
        </>
      )}

      {state.kind === 'reading' && !dragOver && (
        <p className={styles.title} aria-live="polite">
          Reading your CV... usually 10-20 seconds
        </p>
      )}

      {state.kind === 'done' && !dragOver && (
        <>
          {size === 'large' && <FileText className={styles.icon} aria-hidden="true" />}
          <p className={styles.title}>
            {state.filename}
            {state.pageCount ? ` - ${state.pageCount} ${state.pageCount === 1 ? 'page' : 'pages'}` : ''} - read successfully
          </p>
          <button type="button" className={styles.link} onClick={browse}>
            Replace file
          </button>
        </>
      )}

      {state.kind === 'error' && !dragOver && (
        <>
          <p className={styles.title} role="alert">
            {state.message}
          </p>
          <button type="button" className={styles.link} onClick={browse}>
            Choose another file
          </button>
        </>
      )}
    </div>
  );
}
