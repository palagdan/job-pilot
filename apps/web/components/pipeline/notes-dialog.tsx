'use client';

import { limits } from '@job-pilot/shared/limits';
import type { PipelineItem } from '@job-pilot/shared/pipeline';
import { useState } from 'react';
import { usePipelineActions, usePipelineNotes } from '../../lib/api/use-pipeline.ts';
import { Button } from '../ui/button.tsx';
import { Modal } from '../ui/dialog.tsx';
import { Skeleton } from '../ui/skeleton.tsx';
import { TextArea } from '../ui/text-area.tsx';
import { itemTitle } from './pipeline-labels.ts';
import styles from './pipeline.module.css';

const noteDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );

/** "Add note": the item's notes (newest first) and a field for a new one. */
export function NotesDialog({
  item,
  open,
  onOpenChange,
}: {
  item: PipelineItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const notes = usePipelineNotes(item.id, open);
  const { addNote } = usePipelineActions(item);
  const [body, setBody] = useState('');
  const trimmed = body.trim();
  const tooLong = body.length > limits.noteBody.max;

  const save = () =>
    addNote.mutate(trimmed, {
      onSuccess: () => setBody(''),
    });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Notes"
      description={itemTitle(item)}
      actions={
        <>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            variant="primary"
            onClick={save}
            loading={addNote.isPending}
            loadingLabel="Saving..."
            disabled={!trimmed || tooLong}
            disabledReason={tooLong ? `Up to ${limits.noteBody.max} characters` : 'Write a note first'}
          >
            Add note
          </Button>
        </>
      }
    >
      <TextArea
        label="New note"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Recruiter name, what they asked, what to prepare..."
        error={tooLong ? `Up to ${limits.noteBody.max} characters` : undefined}
        hint={`${body.length} / ${limits.noteBody.max}`}
      />
      {notes.isPending ? (
        <Skeleton height={48} radius="12px" />
      ) : notes.isError ? (
        <p className={styles.muted} role="alert">
          We could not load the notes.
        </p>
      ) : notes.data.length > 0 ? (
        <ul className={styles.notes} aria-label="Notes">
          {notes.data.map((n) => (
            <li key={n.id}>
              <p>{n.body}</p>
              <time dateTime={n.createdAt}>{noteDate(n.createdAt)}</time>
            </li>
          ))}
        </ul>
      ) : null}
    </Modal>
  );
}
