import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export interface EmailSender {
  send(email: OutgoingEmail): Promise<{ providerMessageId: string }>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export const createResendSender = (
  apiKey: string,
  from: string,
  fetchImpl: FetchLike = fetch,
): EmailSender => ({
  send: async ({ to, subject, html, text, headers }) => {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text, headers }),
    });
    if (!response.ok) {
      throw new Error(
        `Resend responded ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }
    const body = (await response.json()) as { id?: string };
    if (!body.id) throw new Error('Resend response had no id');
    return { providerMessageId: body.id };
  },
});

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** Writes each email as an .html file instead of sending it. Used when `RESEND_API_KEY` is empty. */
export const createPreviewSender = (
  dir: string,
  log: (message: string) => void = (m) => console.log(m),
): EmailSender => ({
  send: async ({ to, subject, html }) => {
    const folder = resolve(dir);
    await mkdir(folder, { recursive: true });
    const name = `${Date.now()}-${slug(to)}-${slug(subject)}.html`;
    const path = join(folder, name);
    await writeFile(path, html, 'utf8');
    log(`email preview written: ${path}`);
    return { providerMessageId: `preview:${name}` };
  },
});

export type EmailSenderEnv = {
  RESEND_API_KEY?: string | undefined;
  EMAIL_FROM: string;
  EMAIL_PREVIEW_DIR: string;
};

export const createEmailSenderFromEnv = (
  env: EmailSenderEnv,
  log?: (message: string) => void,
): EmailSender =>
  env.RESEND_API_KEY
    ? createResendSender(env.RESEND_API_KEY, env.EMAIL_FROM)
    : createPreviewSender(env.EMAIL_PREVIEW_DIR, log);
