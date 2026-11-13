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

  it('throws for templates not implemented yet', () => {
    expect(() => renderEmail('run_digest', {}, links)).toThrow('not implemented yet');
  });
});
