import type { Db } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { emailLog } from '@job-pilot/db/schema/notifications';
import { schedule } from '@job-pilot/db/schema/profile';
import { renderEmail } from '@job-pilot/emails/render';
import type { EmailSender } from '@job-pilot/emails/sender';
import { createUnsubscribeToken } from '@job-pilot/emails/unsubscribe-token';
import type { JobHandler } from '@job-pilot/jobs/client';
import { type EmailTemplate, emailTemplates } from '@job-pilot/shared/enums';
import { eq } from 'drizzle-orm';
import type { Log } from '../log.ts';

export type SendEmailDeps = {
  db: Db;
  sender: EmailSender;
  log: Log;
  webUrl: string;
  apiUrl: string;
  unsubscribeSecret: string;
};

const isTemplate = (value: string): value is EmailTemplate =>
  (emailTemplates as readonly string[]).includes(value);

/**
 * Sends one email at most once per `dedupeKey` (`email_log`). `welcome` is transactional and ignores the
 * notification preferences; every other template respects `schedule.notifyEmail` and the unsubscribe flag.
 * A failed send is rethrown so pg-boss retries; the retry sends again unless the row is already `sent`.
 */
export const sendEmail =
  ({
    db,
    sender,
    log,
    webUrl,
    apiUrl,
    unsubscribeSecret,
  }: SendEmailDeps): JobHandler<'email.send'> =>
  async ({ data }) => {
    const { template, userId, dedupeKey } = data;
    if (!isTemplate(template)) {
      log.warn('email skipped: unknown template', { template });
      return;
    }

    const [recipient] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        onboardingStep: user.onboardingStep,
        onboardingCompletedAt: user.onboardingCompletedAt,
        pausedAt: user.pausedAt,
        emailUnsubscribedAt: user.emailUnsubscribedAt,
        notifyEmail: schedule.notifyEmail,
      })
      .from(user)
      .leftJoin(schedule, eq(schedule.userId, user.id))
      .where(eq(user.id, userId))
      .limit(1);
    if (!recipient) {
      log.info('email skipped: user missing', { template, userId });
      return;
    }

    if (template !== 'welcome') {
      const optedOut =
        recipient.notifyEmail === false || recipient.emailUnsubscribedAt || recipient.pausedAt;
      const obsolete = template === 'finish_setup_reminder' && recipient.onboardingCompletedAt;
      if (optedOut || obsolete) {
        log.info('email skipped: not wanted', { template, userId });
        return;
      }
    }

    const [inserted] = await db
      .insert(emailLog)
      .values({ userId, template, dedupeKey })
      .onConflictDoNothing({ target: emailLog.dedupeKey })
      .returning({ id: emailLog.id });
    let logId = inserted?.id;
    if (!logId) {
      const [existing] = await db
        .select({ id: emailLog.id, status: emailLog.status })
        .from(emailLog)
        .where(eq(emailLog.dedupeKey, dedupeKey))
        .limit(1);
      if (!existing || existing.status === 'sent') {
        log.info('email skipped: already sent', { template, dedupeKey });
        return;
      }
      logId = existing.id;
    }

    try {
      const token = createUnsubscribeToken(userId, unsubscribeSecret);
      const unsubscribeUrl = `${apiUrl}/v1/email/unsubscribe?token=${token}`;
      const mail = renderEmail(
        template,
        { name: recipient.name, onboardingStep: recipient.onboardingStep, ...data.data },
        { webUrl, unsubscribeUrl },
      );
      const { providerMessageId } = await sender.send({
        to: recipient.email,
        ...mail,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      await db
        .update(emailLog)
        .set({ status: 'sent', providerMessageId, sentAt: new Date(), error: null })
        .where(eq(emailLog.id, logId));
      log.info('email sent', { template, userId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(emailLog)
        .set({ status: 'failed', error: message.slice(0, 1000) })
        .where(eq(emailLog.id, logId));
      throw error;
    }
  };
