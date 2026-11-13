import { definePrompt } from '../prompt.ts';

/** CV file text → `cvContentSchema` (use with `generateObject`). */
export const parseCvPrompt = definePrompt<{ cvText: string }>({
  name: 'parse-cv',
  version: 'parse-cv@1',
  task: 'parse_cv',
  system: [
    'You extract structured data from a CV. The CV may be in Czech, Slovak or English.',
    'Rules:',
    '- Copy facts only. Never invent companies, titles, dates, skills or links.',
    '- Keep the language of the original text for summary and bullets.',
    '- Dates as "YYYY-MM". If only a year is given use "YYYY-01". Unknown date: null. Current role: end = null.',
    '- headline: the current or most recent job title, or the title the CV states.',
    '- summary: the CV profile/summary paragraph; if missing, write one neutral sentence from the facts.',
    '- skills: short skill names (max 30), no duplicates.',
    '- languages.level: one of basic, conversational, professional, native (B1/B2 = conversational, C1/C2 = professional, mother tongue = native).',
    '- Missing sections: empty arrays. Missing contact fields: null.',
  ].join('\n'),
  user: ({ cvText }) => `CV text:\n"""\n${cvText}\n"""`,
});
