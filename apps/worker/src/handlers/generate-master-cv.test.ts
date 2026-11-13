import { randomUUID } from 'node:crypto';
import { createDb } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { cv, upload } from '@job-pilot/db/schema/cv';
import { profile, profileProof, schedule, targets } from '@job-pilot/db/schema/profile';
import type { CvContent } from '@job-pilot/shared/cv';
import { messages } from '@job-pilot/shared/limits';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMasterCv } from './generate-master-cv.ts';

const url = process.env.TEST_DATABASE_URL;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

const original: CvContent = {
  header: {
    fullName: 'Jan Novak',
    headline: 'Senior Full-stack vyvojar',
    location: 'Praha',
    email: 'jan@example.com',
    phone: null,
    links: [],
  },
  summary: 'Full-stack vyvojar.',
  experience: [
    {
      company: 'Productboard',
      title: 'Senior Software Engineer',
      location: 'Praha',
      start: '2021-03',
      end: null,
      bullets: ['Vyvoj integraci'],
    },
  ],
  education: [],
  skills: ['TypeScript'],
  languages: [],
  projects: [],
};

const generated = {
  cv: { ...original, header: { ...original.header, headline: 'Tech Lead' } },
  changes: ['Headline rewritten for your target roles'],
};

describe.skipIf(!url)('generateMasterCv', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const send = vi.fn();
  const generateObject = vi.fn();
  const handler = generateMasterCv({
    db,
    llm: { generateObject } as never,
    queue: { send },
    log,
  });
  let userId = '';

  const setup = async ({
    completed = true,
    parsed = true,
  }: {
    completed?: boolean;
    parsed?: boolean;
  } = {}) => {
    const [u] = await db
      .insert(user)
      .values({
        name: 'Jan Novak',
        email: `jan-${randomUUID()}@example.com`,
        onboardingCompletedAt: completed ? new Date() : null,
      })
      .returning({ id: user.id });
    userId = (u as { id: string }).id;
    await db.insert(upload).values({
      userId,
      storageKey: `k-${userId}`,
      filename: 'cv.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      parseStatus: parsed ? 'parsed' : 'failed',
      parsedContent: parsed ? original : null,
    });
    await db.insert(profile).values({
      userId,
      fullName: 'Jan Novak',
      currentTitle: 'Senior Engineer',
      skills: ['TypeScript'],
      confirmedAt: new Date(),
    });
    await db.insert(profileProof).values({ userId, text: 'Open source lib', position: 0 });
    await db.insert(targets).values({
      userId,
      roles: ['Tech Lead'],
      locations: ['Praha'],
      workFormats: ['remote'],
    });
    await db.insert(schedule).values({ userId });
  };

  const masters = () => db.select().from(cv).where(eq(cv.userId, userId)).orderBy(asc(cv.version));
  const run = () => handler({ id: 'j', data: { userId } });

  beforeEach(async () => {
    send.mockReset();
    generateObject.mockReset();
    generateObject.mockResolvedValue({ object: generated });
    if (userId) await db.delete(user).where(eq(user.id, userId));
    userId = '';
  });
  afterAll(async () => {
    if (userId) await db.delete(user).where(eq(user.id, userId));
    await close();
  });

  it('creates master v1 for review and enqueues the agent_live email once', async () => {
    await setup();
    await run();
    const rows = await masters();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      version: 1,
      kind: 'master',
      origin: 'generated',
      status: 'needs_review',
      content: generated.cv,
      changes: generated.changes,
      error: null,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('email.send', {
      template: 'agent_live',
      userId,
      dedupeKey: `agent_live:${userId}`,
      data: expect.objectContaining({
        firstName: 'Jan',
        roles: ['Tech Lead'],
        frequency: 'daily',
        runHour: 8,
        notifyEmail: true,
        notifyPush: false,
      }),
    });
  });

  it('creates v2 when run again (regenerate)', async () => {
    await setup();
    await run();
    await run();
    expect((await masters()).map((r) => r.version)).toEqual([1, 2]);
  });

  it('reuses a generating row on retry', async () => {
    await setup();
    await db.insert(cv).values({ userId, kind: 'master', status: 'generating', version: 1 });
    await run();
    const rows = await masters();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('needs_review');
  });

  it('marks the row failed on llm error and sends no email', async () => {
    await setup();
    generateObject.mockRejectedValue(new Error('boom'));
    await run();
    const rows = await masters();
    expect(rows[0]).toMatchObject({ status: 'failed', error: messages.masterCvFailed });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not email before onboarding is completed', async () => {
    await setup({ completed: false });
    await run();
    expect((await masters())[0]?.status).toBe('needs_review');
    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing without a parsed upload', async () => {
    await setup({ parsed: false });
    await run();
    expect(await masters()).toHaveLength(0);
    expect(generateObject).not.toHaveBeenCalled();
  });
});
