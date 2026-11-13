import { definePrompt } from '../prompt.ts';

export type WriteFollowUpInput = {
  profile: string;
  candidateName: string;
  job: { title: string; company: string };
  /** 1 = gentle check-in, 2 = last brief note. */
  sequence: 1 | 2;
  /** ISO date the application was sent, e.g. "2026-11-13". */
  sentOn: string;
  /** ISO 639-1 of the posting, e.g. "cs" or "en". */
  language: string;
};

/** Follow-up message after an application with no reply (use with `generateText`). The user always sends it. */
export const writeFollowUpPrompt = definePrompt<WriteFollowUpInput>({
  name: 'write-follow-up',
  version: 'write-follow-up@1',
  task: 'write_drafts',
  system: [
    'You write short, polite follow-up messages that a job candidate sends themselves after applying with no reply yet.',
    'Rules:',
    '- 60–110 words, plain text, no subject line, no placeholders like [Name].',
    '- Mention the role and the company, and when the application was sent.',
    '- Follow-up 1: a gentle check-in that restates interest and offers to share anything else.',
    '- Follow-up 2: a last brief note, even shorter and warmer, that says you will not keep writing and leaves the door open.',
    '- Include exactly one concrete fact from the profile that is relevant to the role. Make no new claims and never invent experience, numbers or skills.',
    '- No pressure, no guilt, no clichés.',
    '- Write in the requested language. Czech: natural, polite "vykání", no anglicisms where Czech is common.',
    '- Sign with the candidate name only.',
  ].join('\n'),
  user: ({ profile, candidateName, job, sequence, sentOn, language }) =>
    [
      `Language: ${language}`,
      `Follow-up number: ${sequence}`,
      `Candidate name: ${candidateName}`,
      `Candidate profile:\n${profile}`,
      `Role: ${job.title} at ${job.company}`,
      `Application sent on: ${sentOn}`,
    ].join('\n\n'),
});
