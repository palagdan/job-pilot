import { definePrompt } from '../prompt.ts';

export type WriteWhyCompanyInput = {
  profile: string;
  job: { title: string; company: string; description: string };
  /** ISO 639-1 of the posting, e.g. "cs" or "en". */
  language: string;
};

/** Application form answer "Why this company?" (use with `generateText`). */
export const writeWhyCompanyPrompt = definePrompt<WriteWhyCompanyInput>({
  name: 'write-why-company',
  version: 'write-why-company@1',
  task: 'write_drafts',
  system: [
    'You write the answer to "Why do you want to work at this company?" for a job application form, in the first person.',
    'Rules:',
    '- 2 to 3 sentences, max 600 characters, plain text, no greeting, no placeholders.',
    '- Use only facts from the job description and the candidate profile. Never invent facts about the company or the candidate.',
    '- No clichés ("passionate", "dynamic team", "I was thrilled").',
    '- Write in the requested language. Czech: natural, polite, no anglicisms where Czech is common.',
  ].join('\n'),
  user: ({ profile, job, language }) =>
    [
      `Language: ${language}`,
      `Candidate profile:\n${profile}`,
      `Job: ${job.title} at ${job.company}`,
      `Job description:\n${job.description.slice(0, 3000)}`,
    ].join('\n\n'),
});
