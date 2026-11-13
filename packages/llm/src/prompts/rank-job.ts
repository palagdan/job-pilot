import { z } from 'zod';
import { definePrompt } from '../prompt.ts';

export const rankJobSchema = z.object({
  /** 0–100 */
  fitScore: z.number().int().min(0).max(100),
  /** One sentence, shown on the Today card. */
  why: z.string(),
  /** Biggest gap, or null. Shown as "Gap check: …". */
  gapNote: z.string().nullable(),
});
export type RankJob = z.infer<typeof rankJobSchema>;

export type RankJobInput = {
  profile: string;
  targets: string;
  job: { title: string; company: string; location: string; description: string };
};

/** One job vs the user's profile and targets → fit score, why, gap. */
export const rankJobPrompt = definePrompt<RankJobInput>({
  name: 'rank-job',
  version: 'rank-job@1',
  task: 'rank',
  system: [
    "You are a strict recruiter scoring how well a job fits a candidate's profile and targets.",
    'Score guide: 85–100 strong match on role, seniority, skills and location; 60–84 good match with gaps;',
    '30–59 partial (adjacent role or seniority mismatch); 0–29 different field or excluded.',
    'Excluded companies or a different profession must score below 20.',
    'why: one short sentence in English, addressed to the candidate ("Matches your …"), max 140 characters.',
    'gapNote: the single biggest missing requirement in max 80 characters, or null if none.',
  ].join('\n'),
  user: ({ profile, targets, job }) =>
    [
      `Candidate profile:\n${profile}`,
      `Candidate targets:\n${targets}`,
      `Job: ${job.title} at ${job.company} (${job.location})`,
      `Job description (may be Czech):\n${job.description.slice(0, 4000)}`,
    ].join('\n\n'),
});
