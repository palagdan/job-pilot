import { definePrompt } from '../prompt.ts';

export type WriteCoverInput = {
  profile: string;
  job: { title: string; company: string; description: string };
  /** ISO 639-1 of the posting, e.g. "cs" or "en". */
  language: string;
};

/** Short cover text for a Direct application (use with `generateText`). The user always sends it. */
export const writeCoverPrompt = definePrompt<WriteCoverInput>({
  name: 'write-cover',
  version: 'write-cover@1',
  task: 'write_drafts',
  system: [
    'You write short cover texts for job applications that the candidate will send themselves.',
    'Rules:',
    '- 120–180 words, plain text, no subject line, no placeholders like [Name].',
    '- Use only facts from the profile. Never invent experience, numbers or skills.',
    '- Open with why this role at this company, then 2 concrete matching facts, then a short closing line.',
    '- Write in the requested language. Czech: natural, polite "vykání", no anglicisms where Czech is common.',
    '- Sign with the candidate name only.',
  ].join('\n'),
  user: ({ profile, job, language }) =>
    [
      `Language: ${language}`,
      `Candidate profile:\n${profile}`,
      `Job: ${job.title} at ${job.company}`,
      `Job description:\n${job.description.slice(0, 3000)}`,
    ].join('\n\n'),
});
