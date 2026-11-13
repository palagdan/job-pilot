'use client';

import type { PipelineItem } from '@job-pilot/shared/pipeline';
import { useState } from 'react';
import { usePipelineActions } from '../../lib/api/use-pipeline.ts';
import { Button } from '../ui/button.tsx';
import { Modal } from '../ui/dialog.tsx';
import { TextInput } from '../ui/text-input.tsx';
import { itemTitle } from './pipeline-labels.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/** `datetime-local` value ("2026-11-16T11:00") in the browser's time zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "Interview": status Interview, with an optional date and time (shown in "Next follow-up"). */
export function InterviewDialog({
  item,
  open,
  onOpenChange,
}: {
  item: PipelineItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setStatus } = usePipelineActions(item);
  const [value, setValue] = useState(() => toLocalInput(item.interviewAt));

  const save = () =>
    setStatus.mutate(
      { status: 'interview', interviewAt: value ? new Date(value).toISOString() : null },
      { onSuccess: () => onOpenChange(false) },
    );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Interview"
      description={itemTitle(item)}
      actions={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={setStatus.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={setStatus.isPending} loadingLabel="Saving...">
            Save
          </Button>
        </>
      }
    >
      <TextInput
        label="Date and time"
        hint="Optional. Leave empty if it is not set yet."
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </Modal>
  );
}
