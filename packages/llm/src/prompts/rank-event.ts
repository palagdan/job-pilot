import { definePrompt } from '../prompt.ts';
import { rankJobSchema } from './rank-job.ts';

/** Same output shape as a ranked job: fit score, why, gap. */
export const rankEventSchema = rankJobSchema;
export type RankEvent = ReturnType<typeof rankEventSchema.parse>;

export type RankEventInput = {
  profile: string;
  targets: string;
  event: {
    title: string;
    organizer: string;
    location: string;
    startsAt: string;
    description: string;
  };
};

/** One event vs the user's profile and targets → career relevance score. */
export const rankEventPrompt = definePrompt<RankEventInput>({
  name: 'rank-event',
  version: 'rank-event@1',
  task: 'rank',
  system: [
    'You judge how useful an event is for the career goals of a candidate (networking, learning, meeting hiring people).',
    'Score guide: 75–100 networking, industry or tech event directly in the candidate field and target roles;',
    '40–74 related professional event (adjacent field, general startup or business meetup);',
    '0–15 parties, sports, culture, hobbies, kids or anything without career value.',
    'why: one short sentence in English, addressed to the candidate ("Meet …", "Relevant to your …"), max 140 characters.',
    'gapNote: the single biggest reason it may not fit (wrong field, far away, too early-stage) in max 80 characters, or null.',
  ].join('\n'),
  user: ({ profile, targets, event }) =>
    [
      `Candidate profile:\n${profile}`,
      `Candidate targets:\n${targets}`,
      `Event: ${event.title} by ${event.organizer} (${event.location}), starts ${event.startsAt}`,
      `Event description (may be Czech):\n${event.description.slice(0, 3000)}`,
    ].join('\n\n'),
});
