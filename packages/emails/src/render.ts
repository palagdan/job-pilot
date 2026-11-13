import type { EmailTemplate } from '@job-pilot/shared/enums';
import type { LayoutLinks } from './layout.ts';
import { type AgentLiveData, agentLive } from './templates/agent-live.ts';
import {
  type FinishSetupReminderData,
  finishSetupReminder,
} from './templates/finish-setup-reminder.ts';
import { type WelcomeData, welcome } from './templates/welcome.ts';

export type RenderedEmail = { subject: string; html: string; text: string };

export type TemplateData = {
  agent_live: AgentLiveData;
  welcome: WelcomeData;
  finish_setup_reminder: FinishSetupReminderData;
};

/** Plain TS templates (no React Email): Node 24 cannot run .tsx without a build step. */
export const renderEmail = (
  template: EmailTemplate,
  data: Record<string, unknown>,
  links: LayoutLinks,
): RenderedEmail => {
  switch (template) {
    case 'welcome':
      return welcome(data as WelcomeData, links);
    case 'finish_setup_reminder':
      return finishSetupReminder(data as FinishSetupReminderData, links);
    case 'agent_live':
      return agentLive(data as AgentLiveData, links);
    default:
      throw new Error(`Email template "${template}" is not implemented yet`);
  }
};
