'use client';

import type { CvContent } from '@job-pilot/shared/cv';
import { messages } from '@job-pilot/shared/limits';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { callApi } from '../../lib/api/api-client.ts';
import { Button } from '../ui/button.tsx';
import { ConfirmDialog } from '../ui/dialog.tsx';
import { TagInput } from '../ui/tag-input.tsx';
import { TextArea } from '../ui/text-area.tsx';
import { TextInput } from '../ui/text-input.tsx';
import { toast } from '../ui/toast.tsx';
import styles from './cv-editor.module.css';
import { notifyError } from '../../lib/errors/notify-error.ts';

type Draft = {
  headline: string;
  summary: string;
  experience: { title: string; company: string; bullets: string }[];
  skills: string[];
};

const toDraft = (c: CvContent): Draft => ({
  headline: c.header.headline,
  summary: c.summary,
  experience: c.experience.map((e) => ({ title: e.title, company: e.company, bullets: e.bullets.join('\n') })),
  skills: c.skills,
});

const fromDraft = (c: CvContent, d: Draft): CvContent => ({
  ...c,
  header: { ...c.header, headline: d.headline.trim() },
  summary: d.summary.trim(),
  experience: c.experience.map((e, i) => {
    const x = d.experience[i];
    if (!x) return e;
    return {
      ...e,
      title: x.title.trim(),
      company: x.company.trim(),
      bullets: x.bullets
        .split('\n')
        .map((b) => b.replace(/^\s*[•\-*]\s*/, '').trim())
        .filter(Boolean),
    };
  }),
  skills: d.skills,
});

/**
 * "Edit text" for a CV: the parts the agent writes and users most often adjust — headline, summary, role titles,
 * bullets (one per line) and skills. Dates, education and contacts stay as they are.
 * Leaving with unsaved edits asks C08 "Leave without saving?".
 */
export function CvEditor({ cvId, content, onDone }: { cvId: string; content: CvContent; onDone: (saved: boolean) => void }) {
  const [initial] = useState(() => toDraft(content));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmLeave, setConfirmLeave] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  // Browser close / reload with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => callApi('editCv', { params: { id: cvId }, body: { content: fromDraft(content, draft) } }),
    onSuccess: () => {
      toast('Saved');
      onDone(true);
    },
    onError: (e) => notifyError(e, 'Could not save. Check your connection.', { retry: () => save.mutate() }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!draft.summary.trim()) found.summary = messages.draftEmpty;
    draft.experience.forEach((x, i) => {
      if (!x.title.trim()) found[`experience.${i}.title`] = 'Enter the role title.';
    });
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  };

  const setExperience = (i: number, patch: Partial<Draft['experience'][number]>) =>
    setDraft((d) => ({ ...d, experience: d.experience.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <TextInput label="Headline" value={draft.headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} />
      <TextArea
        label="Summary"
        rows={4}
        value={draft.summary}
        error={errors.summary}
        onChange={(e) => {
          setDraft({ ...draft, summary: e.target.value });
          setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== 'summary')));
        }}
      />

      {draft.experience.map((x, i) => (
        <fieldset key={`${content.experience[i]?.company}-${i}`} className={styles.role}>
          <legend className={styles.legend}>Experience {i + 1}</legend>
          <div className={styles.row}>
            <TextInput
              label="Title"
              value={x.title}
              error={errors[`experience.${i}.title`]}
              onChange={(e) => setExperience(i, { title: e.target.value })}
            />
            <TextInput label="Company" value={x.company} onChange={(e) => setExperience(i, { company: e.target.value })} />
          </div>
          <TextArea
            label="Bullets"
            hint="One per line."
            rows={Math.max(3, x.bullets.split('\n').length + 1)}
            value={x.bullets}
            onChange={(e) => setExperience(i, { bullets: e.target.value })}
          />
        </fieldset>
      ))}

      <TagInput label="Skills" value={draft.skills} onChange={(skills) => setDraft({ ...draft, skills })} max={30} itemName="skills" />

      <div className={styles.actions}>
        <Button onClick={() => (dirty ? setConfirmLeave(true) : onDone(false))}>Cancel</Button>
        <Button type="submit" variant="primary" loading={save.isPending} loadingLabel="Saving..." disabled={!dirty} disabledReason="No changes yet">
          Save changes
        </Button>
      </div>

      {/* C08 Unsaved changes */}
      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        tone="danger"
        title="Leave without saving?"
        description="Your changes on this page will be lost."
        cancelLabel="Stay"
        confirmLabel="Discard changes"
        onConfirm={() => onDone(false)}
      />
    </form>
  );
}
