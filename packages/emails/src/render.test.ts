import { describe, expect, it } from 'vitest';
import { renderEmail } from './render.ts';
import { checklist } from './templates/finish-setup-reminder.ts';

const links = {
  webUrl: 'https://app.example.com',
  unsubscribeUrl: 'https://api.example.com/u?t=1',
};

describe('renderEmail', () => {
  it('renders welcome', () => {
    const mail = renderEmail('welcome', { name: 'Ada Lovelace' }, links);
    expect(mail.subject).toBe('Welcome to JobPilot');
    expect(mail.html).toContain('Hi Ada,');
    expect(mail.html).toContain('href="https://app.example.com/onboarding"');
    expect(mail.html).toContain('Finish setup');
    expect(mail.text).toContain('Finish setup: https://app.example.com/onboarding');
    expect(mail.text).toContain('Unsubscribe: https://api.example.com/u?t=1');
  });

  it('escapes the user name', () => {
    const mail = renderEmail('welcome', { name: '<img src=x>' }, links);
    expect(mail.html).not.toContain('<img');
  });

  it('renders the reminder with checklist marks', () => {
    expect(checklist('set_targets').map((i) => i.done)).toEqual([true, true, false, false]);
    const mail = renderEmail(
      'finish_setup_reminder',
      { name: 'Ada', onboardingStep: 'confirm_profile' },
      links,
    );
    expect(mail.subject).toBe('Finish setting up JobPilot');
    expect(mail.html).toContain('Continue setup');
    expect(mail.html).toContain('href="https://app.example.com/onboarding"');
    expect(mail.text).toContain('[x] Upload your CV');
    expect(mail.text).toContain('[ ] Confirm your profile');
    expect(mail.text).toContain('[ ] Choose your schedule');
    expect(mail.html.match(/&#10003;/g)).toHaveLength(1);
  });

  it('throws for unknown templates', () => {
    // All four templates exist now (run_digest was the last); an unknown name still fails loudly.
    expect(() => renderEmail('unknown' as never, {}, links)).toThrow('not implemented yet');
  });
});

describe('agent_live', () => {
  const data = {
    firstName: 'Jan',
    roles: ['Senior Full-stack Developer', 'Tech Lead'],
    locations: ['Praha', 'Remote EU'],
    workFormats: ['remote', 'hybrid'],
    findJobs: true,
    findEvents: true,
    frequency: 'daily',
    runHour: 8,
    dayOfWeek: null,
    notifyEmail: true,
    notifyPush: false,
  };

  it('renders subject, link and summary', () => {
    const mail = renderEmail('agent_live', data, links);
    expect(mail.subject).toBe('Your JobPilot agent is live');
    expect(mail.html).toContain('Hi Jan,');
    expect(mail.html).toContain('Your CV is ready to review');
    expect(mail.html).toContain('Review your new CV');
    expect(mail.html).toContain('href="https://app.example.com/cvs/new"');
    expect(mail.text).toContain('Review your new CV: https://app.example.com/cvs/new');
    expect(mail.text).toContain(
      'Looking for: Senior Full-stack Developer, Tech Lead (jobs and events)',
    );
    expect(mail.text).toContain('Where: Praha, Remote EU, remote, hybrid');
    expect(mail.text).toContain('Runs: Daily at 08:00');
    expect(mail.text).toContain('Notifies by: Email');
  });

  it('formats frequency, kinds and notifications', () => {
    const text = (extra: object) => renderEmail('agent_live', { ...data, ...extra }, links).text;
    expect(text({ frequency: 'every_3_days', runHour: 18 })).toContain(
      'Runs: Every 3 days at 18:00',
    );
    expect(text({ frequency: 'weekly', dayOfWeek: 1, runHour: 6 })).toContain(
      'Runs: Weekly on Monday at 06:00',
    );
    expect(text({ findEvents: false })).toContain('(jobs)');
    expect(text({ findJobs: false })).toContain('(events)');
    expect(text({ notifyPush: true })).toContain('Notifies by: Email and push');
    expect(text({ notifyEmail: false, notifyPush: true })).toContain('Notifies by: Push');
  });

  it('escapes user values', () => {
    const mail = renderEmail(
      'agent_live',
      { ...data, firstName: '<b>x</b>', roles: ['<script>alert(1)</script>'] },
      links,
    );
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>x');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});
