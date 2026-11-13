import type { CvContent } from '@job-pilot/shared/cv';

/** Realistic CV with Czech names and places (diacritics must survive rendering). Used by tests and the preview script. */
export const fixtureCv: CvContent = {
  header: {
    fullName: 'Řehoř Dvořák',
    headline: 'Head of Performance Marketing',
    location: 'Plzeň, Czechia',
    email: 'rehor.dvorak@example.com',
    phone: '+420 601 234 567',
    links: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/rehor-dvorak/' }],
  },
  summary:
    'Performance marketing lead with 11 years in iGaming, ad tech and fintech. Built and scaled paid acquisition across 5 markets, owning a €4M yearly budget and a team of 8.',
  experience: [
    {
      company: 'Škoda Digital',
      title: 'Head of Performance Marketing',
      location: 'Prague',
      start: '2021-03',
      end: null,
      bullets: [
        'Scaled paid acquisition across 5 markets; cut blended CAC by 23% in 12 months.',
        'Built and led a team of 8 across paid search, paid social and programmatic.',
        'Introduced incrementality testing and a marketing-mix model for budget planning.',
      ],
    },
    {
      company: 'Žabka Ventures',
      title: 'Performance Marketing Manager',
      location: 'Brno',
      start: '2016-06',
      end: '2021-02',
      bullets: [
        'Grew app installs 4× with a €1.2M budget.',
        'Launched the affiliate programme (18% of revenue).',
      ],
    },
  ],
  education: [
    {
      school: 'Vysoká škola ekonomická v Praze',
      degree: 'MSc',
      field: 'Marketing',
      start: '2010-09',
      end: '2015-06',
    },
  ],
  skills: [
    'Paid acquisition',
    'Google Ads',
    'Meta Ads',
    'Programmatic',
    'Attribution',
    'Budget planning',
    'Team lead',
  ],
  languages: [
    { language: 'Czech', level: 'native' },
    { language: 'English', level: 'professional' },
  ],
  projects: [
    {
      name: 'Incrementality playbook',
      description: 'Internal guide used by 3 marketing teams.',
      url: null,
    },
  ],
};
