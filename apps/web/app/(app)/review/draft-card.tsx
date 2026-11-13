'use client';

import type { Draft } from '@job-pilot/shared/draft';
import { messages } from '@job-pilot/shared/limits';
import { useMutation } from '@tanstack/react-query';
import { Copy, Pencil } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '../../../components/ui/button.tsx';
import { TextArea } from '../../../components/ui/text-area.tsx';
import { toast } from '../../../components/ui/toast.tsx';
import { ApiError, callApi } from '../../../lib/api/api-client.ts';
import { notifyError } from '../../../lib/errors/notify-error.ts';
import { copyText } from './copy-text.ts';
import styles from './review.module.css';

export const draftTitle = (d: Draft): string => {
  if (d.label) return d.label;
  return d.kind === 'cover_text' ? 'Cover text' : d.kind === 'follow_up' ? 'Follow-up' : 'Notes';
};

/** A text of the pack: Copy, and Edit (textarea, counter, Save / Cancel; a stale version shows a reload prompt). */
export function DraftCard({
  draft,
  onDirtyChange,
  onSaved,
  onReload,
}: {
  draft: Draft;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onSaved: (draft: Draft) => void;
  onReload: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.body);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const counterId = useId();
  const dirty = editing && text !== draft.body;

  useEffect(() => {
    onDirtyChange(draft.id, dirty);
  }, [dirty, draft.id, onDirtyChange]);
  useEffect(() => () => onDirtyChange(draft.id, false), [draft.id, onDirtyChange]);

  const validate = (value: string): string | null => {
    if (!value.trim()) return messages.draftEmpty;
    if (draft.charLimit !== null && value.length > draft.charLimit) return `Keep this under ${draft.charLimit} characters.`;
    return null;
  };

  const save = useMutation({
    mutationFn: () => callApi('updateDraft', { params: { id: draft.id }, body: { body: text, version: draft.version } }),
    onSuccess: (saved) => {
      onSaved(saved);
      setEditing(false);
      setConflict(false);
      toast('Saved');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'conflict') setConflict(true);
      else if (e instanceof ApiError && e.code === 'validation_failed') setError(e.fields?.body ?? e.message);
      else notifyError(e, 'Could not save. Check your connection.', { retry: () => save.mutate() });
    },
  });

  const submit = () => {
    const problem = validate(text);
    setError(problem);
    if (!problem) save.mutate();
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
    setConflict(false);
    setText(draft.body);
  };

  const reload = async () => {
    await onReload();
    setEditing(false);
    setConflict(false);
    setError(null);
  };

  const title = draftTitle(draft);
  const over = draft.charLimit !== null && text.length > draft.charLimit;

  return (
    <li className={styles.draft}>
      <div className={styles.draftHead}>
        <h3 className={styles.draftTitle}>
          {title}
          {draft.editedByUser && <span className={styles.edited}> · edited</span>}
        </h3>
        {!editing && (
          <div className={styles.draftActions}>
            <Button size="sm" icon={<Copy aria-hidden="true" size={14} />} onClick={() => void copyText(draft.body, `${title} copied`)}>
              Copy
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Pencil aria-hidden="true" size={14} />}
              onClick={() => {
                setText(draft.body);
                setEditing(true);
              }}
            >
              Edit
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <div className={styles.editor}>
          <TextArea
            aria-label={`${title} text`}
            rows={Math.min(16, Math.max(4, text.split('\n').length + 1))}
            value={text}
            error={error}
            aria-describedby={draft.charLimit !== null ? counterId : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
          />
          {draft.charLimit !== null && (
            <p id={counterId} className={styles.counter} data-over={over || undefined}>
              {text.length} / {draft.charLimit}
            </p>
          )}
          {conflict && (
            <p className={styles.conflict} role="alert">
              This text was changed somewhere else. Reload to see the latest version (your edit will be lost).{' '}
              <Button size="sm" onClick={() => void reload()}>
                Reload latest
              </Button>
            </p>
          )}
          <div className={styles.editorActions}>
            <Button onClick={cancel} disabled={save.isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} loading={save.isPending} loadingLabel="Saving..." disabled={!dirty} disabledReason="No changes yet">
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className={styles.draftBody}>{draft.body}</p>
      )}
    </li>
  );
}
