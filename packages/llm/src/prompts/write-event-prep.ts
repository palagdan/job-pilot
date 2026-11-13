import { z } from 'zod';
import { definePrompt } from '../prompt.ts';

export const writeEventPrepSchema = z.object({
  registrationSteps: z.array(z.string()).min(2).max(4),
  prepNotes: z.string(),
});
export type WriteEventPrep = z.infer<typeof writeEventPrepSchema>;

export type WriteEventPrepInput = {
  profile: string;
  targets: string;
  event: {
    title: string;
    organizer: string | null;
    url: string;
    startsAt: string;
    venue: string | null;
    city: string | null;
    online: boolean;
    description: string;
  };
};

/** Event → how to register and what to prepare (use with `generateObject`). */
export const writeEventPrepPrompt = definePrompt<WriteEventPrepInput>({
  name: 'write-event-prep',
  version: 'write-event-prep@1',
  task: 'write_drafts',
  system: [
    'You help a candidate attend a networking or career event. Write in English.',
    'registrationSteps: 2 to 4 short imperative steps to register, based only on the event URL, organizer, date and description. Do not invent form fields, prices or deadlines.',
    'prepNotes: plain text with "Talking points:" (2 to 3 lines tied to the candidate targets and profile) and "Questions to ask:" (2 lines). Use "- " bullets. Use only facts from the inputs.',
    'Return {"registrationSteps": [<strings>], "prepNotes": <string>}.',
  ].join('\n'),
  user: ({ profile, targets, event }) =>
    [
      `Candidate profile:\n${profile}`,
      `Candidate targets:\n${targets}`,
      `Event (JSON):\n${JSON.stringify({ ...event, description: event.description.slice(0, 3000) })}`,
    ].join('\n\n'),
});
