import { type OnboardingStep, onboardingSteps } from '@job-pilot/shared/enums';
import {
  button,
  emailColors,
  escapeHtml,
  heading,
  type LayoutLinks,
  layout,
  paragraph,
  textFooter,
} from '../layout.ts';

export type FinishSetupReminderData = { name: string; onboardingStep: OnboardingStep };

const labels: Record<OnboardingStep, string> = {
  upload: 'Upload your CV',
  confirm_profile: 'Confirm your profile',
  set_targets: 'Set your targets',
  schedule: 'Choose your schedule',
};

/** `onboardingStep` is the step the user is currently on: earlier steps are done. */
export const checklist = (current: OnboardingStep) => {
  const index = onboardingSteps.indexOf(current);
  return onboardingSteps.map((step, i) => ({ step, label: labels[step], done: i < index }));
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there';

export const finishSetupReminder = (data: FinishSetupReminderData, links: LayoutLinks) => {
  const items = checklist(data.onboardingStep);
  const greeting = `Hi ${firstName(data.name)},`;
  const intro = 'You are a few steps away from your first run. Here is where you are:';
  const url = `${links.webUrl}/onboarding`;
  const rows = items
    .map(
      (i) =>
        `<tr><td style="width:28px;padding:6px 0;font-size:18px;color:${i.done ? emailColors.accent : emailColors.muted};">${i.done ? '&#10003;' : '&#9675;'}</td><td style="padding:6px 0;font-size:16px;color:${emailColors.ink};">${escapeHtml(i.label)}</td></tr>`,
    )
    .join('');
  const body = [
    heading('Finish setting up JobPilot'),
    paragraph(greeting),
    paragraph(intro),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">${rows}</table>`,
    button('Continue setup', url),
  ].join('');
  return {
    subject: 'Finish setting up JobPilot',
    html: layout({ preheader: 'Pick up where you left off.', body, links }),
    text: `${greeting}\n\n${intro}\n\n${items.map((i) => `[${i.done ? 'x' : ' '}] ${i.label}`).join('\n')}\n\nContinue setup: ${url}\n\n${textFooter(links)}`,
  };
};
