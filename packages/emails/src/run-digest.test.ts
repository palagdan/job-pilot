import { describe, expect, it } from 'vitest';
import { renderEmail } from './render.ts';
import { companyList, digestSubject, type RunDigestData } from './templates/run-digest.ts';

const links = {
  webUrl: 'https://app.example.com',
  unsubscribeUrl: 'https://api.example.com/u?t=1',
};
const data: RunDigestData = {
  newJobs: 3,
  newEvents: 2,
  readyToSend: { count: 2, companies: ['Company A', 'Company D'] },
  followUpsDue: { count: 3, companies: ['Company C', 'Company E', 'Company C'] },
};

describe('run digest (email 04)', () => {
  it('matches the Figma copy', () => {
    const mail = renderEmail('run_digest', data, links);
    expect(mail.subject).toBe('5 new, 2 ready to send');
    expect(mail.html).toContain('3 jobs, 2 events.'); // preheader
    expect(mail.html).toContain('Your agent finished its run.');
    expect(mail.html).toContain('5 new opportunities');
    expect(mail.html).toContain('2 packs are ready to send');
    expect(mail.html).toContain('Company A, Company D');
    expect(mail.html).toContain('3 follow-ups are due');
    expect(mail.html).toContain('href="https://app.example.com/today"');
    expect(mail.text).toContain('Open Today: https://app.example.com/today');
    expect(mail.text).toContain('Unsubscribe: https://api.example.com/u?t=1');
  });

  it('leaves out empty rows and uses singulars', () => {
    const one: RunDigestData = {
      newJobs: 1,
      newEvents: 0,
      readyToSend: { count: 0, companies: [] },
      followUpsDue: { count: 0, companies: [] },
    };
    const mail = renderEmail('run_digest', one, links);
    expect(mail.subject).toBe('1 new match');
    expect(mail.html).toContain('1 new opportunity');
    expect(mail.html).not.toContain('ready to send');
    expect(mail.html).not.toContain('follow-up');
    expect(digestSubject({ ...one, newJobs: 6 })).toBe('6 new matches');
  });

  it('dedupes and shortens company lists, escapes names', () => {
    expect(companyList(['A', 'B', 'A', 'C', 'D', 'E'])).toBe('A, B, C and 2 more');
    const mail = renderEmail(
      'run_digest',
      { ...data, readyToSend: { count: 1, companies: ['<script>x</script>'] } },
      links,
    );
    expect(mail.html).not.toContain('<script>x');
  });
});
