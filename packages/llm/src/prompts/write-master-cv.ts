import { type CvContent, cvContentSchema } from '@job-pilot/shared/cv';
import { z } from 'zod';
import { definePrompt } from '../prompt.ts';

export const writeMasterCvSchema = z.object({
  cv: cvContentSchema,
  changes: z.array(z.string()).min(1).max(6),
});

export type WriteMasterCvInput = {
  original: CvContent;
  profile: {
    fullName: string | null;
    currentTitle: string | null;
    experience: string | null;
    location: string | null;
    linkedinUrl: string | null;
    portfolioUrl: string | null;
    summary: string | null;
    skills: string[];
    languages: { language: string; level: string }[];
  };
  proofs: string[];
  targets: { roles: string[]; locations: string[]; workFormats: string[] };
};

/** Parsed CV + confirmed profile + targets → master CV and "what changed" (use with `generateObject`). */
export const writeMasterCvPrompt = definePrompt<WriteMasterCvInput>({
  name: 'write-master-cv',
  version: 'write-master-cv@1',
  task: 'write_cv',
  system: [
    'You rewrite a CV for the target roles of its owner. Output the full CV as structured JSON.',
    'Rules:',
    '- Use only facts from the inputs. Never invent employers, titles, dates, numbers, degrees, skills or links.',
    '- Keep all jobs and education entries and their dates.',
    '- Profile values override the original CV where they differ (the user confirmed them).',
    '- Headline: align it to the first target role when that is truthful for the person, otherwise keep their real title.',
    '- Summary: 2 to 3 sentences, tailored to the target roles.',
    '- Bullets: action verb + what + result. Max 5 per job. Keep existing numbers, never add new numbers.',
    '- Skills: order by relevance to the target roles, max 20, merge the profile skills, no duplicates.',
    '- Keep the language of the original CV (Czech stays Czech, English stays English). Do not translate.',
    '- Keep contact details, links, languages and projects from the inputs; proof items may back up bullets or projects but add no new claims.',
    '- changes: 3 to 6 short user-facing items in English, for example "Headline rewritten for your target roles", "Summary shortened to 3 sentences", "Skills reordered: TypeScript, React first".',
    'Return {"cv": <CV>, "changes": [<strings>]}.',
  ].join('\n'),
  user: ({ original, profile, proofs, targets }) =>
    [
      `Original CV (JSON):\n${JSON.stringify(original)}`,
      `Confirmed profile (JSON):\n${JSON.stringify(profile)}`,
      `Proof items (JSON):\n${JSON.stringify(proofs)}`,
      `Targets (JSON, first role is the most important):\n${JSON.stringify(targets)}`,
    ].join('\n\n'),
});
