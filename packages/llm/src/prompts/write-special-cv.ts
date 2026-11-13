import { type CvContent, cvContentSchema } from '@job-pilot/shared/cv';
import { z } from 'zod';
import { definePrompt } from '../prompt.ts';

export const writeSpecialCvSchema = z.object({
  cv: cvContentSchema,
  changes: z.array(z.string()).min(2).max(5),
});
export type WriteSpecialCv = z.infer<typeof writeSpecialCvSchema>;

export type WriteSpecialCvInput = {
  master: CvContent;
  job: { title: string; company: string; description: string };
  targetRoles: string[];
};

/** Master CV + one posting → a CV tailored to that posting and "what changed" (use with `generateObject`). */
export const writeSpecialCvPrompt = definePrompt<WriteSpecialCvInput>({
  name: 'write-special-cv',
  version: 'write-special-cv@1',
  task: 'write_cv',
  system: [
    'You tailor an existing CV to ONE job posting. Output the full CV as structured JSON.',
    'Rules:',
    '- Use only facts from the master CV. Never invent employers, titles, dates, numbers, degrees, skills or links.',
    "- Headline: match it to the posting's role when that is truthful for the person, otherwise keep it.",
    '- Reorder bullets within each job and reorder skills so what the posting asks for comes first. Drop nothing important.',
    "- Use the posting's keywords only where the master CV supports them.",
    '- Keep all jobs and education entries with their dates, contact details, links, languages and projects.',
    '- Keep the language of the master CV (Czech stays Czech, English stays English). Do not translate.',
    '- Summary: 2 to 3 sentences pointed at this posting, facts from the master CV only.',
    '- changes: 2 to 5 short user-facing items in English, for example "Headline matched to Head of Brand", "3 bullets reordered for brand strategy", "Skills: Brand strategy, Team lead first".',
    'Return {"cv": <CV>, "changes": [<strings>]}.',
  ].join('\n'),
  user: ({ master, job, targetRoles }) =>
    [
      `Master CV (JSON):\n${JSON.stringify(master)}`,
      `Job: ${job.title} at ${job.company}`,
      `Job description:\n${job.description.slice(0, 6000)}`,
      `Candidate target roles (JSON):\n${JSON.stringify(targetRoles)}`,
    ].join('\n\n'),
});
