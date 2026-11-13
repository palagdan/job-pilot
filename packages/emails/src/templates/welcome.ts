import {
  button,
  escapeHtml,
  heading,
  type LayoutLinks,
  layout,
  paragraph,
  textFooter,
} from '../layout.ts';

export type WelcomeData = { name: string };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there';

const steps = ['Upload your CV', 'Confirm your profile', 'Set your targets and schedule'];

export const welcome = (data: WelcomeData, links: LayoutLinks) => {
  const greeting = `Hi ${firstName(data.name)},`;
  const intro =
    'Welcome to JobPilot. It finds jobs and events that fit you and prepares everything, you always send it yourself.';
  const url = `${links.webUrl}/onboarding`;
  const list = steps
    .map((s, i) => `<li style="margin:0 0 8px;">${i + 1}. ${escapeHtml(s)}</li>`)
    .join('');
  const body = [
    heading('Welcome to JobPilot'),
    paragraph(greeting),
    paragraph(intro),
    paragraph('What happens next:'),
    `<ul style="margin:0 0 16px;padding:0;list-style:none;font-size:16px;line-height:24px;">${list}</ul>`,
    button('Finish setup', url),
  ].join('');
  return {
    subject: 'Welcome to JobPilot',
    html: layout({ preheader: 'Three quick steps and your agent is ready.', body, links }),
    text: `${greeting}\n\n${intro}\n\nWhat happens next:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nFinish setup: ${url}\n\n${textFooter(links)}`,
  };
};
