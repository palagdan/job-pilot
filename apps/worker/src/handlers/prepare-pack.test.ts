import { randomUUID } from 'node:crypto';
import { createDb } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { cv } from '@job-pilot/db/schema/cv';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { draft, pipelineItem } from '@job-pilot/db/schema/pipeline';
import { profile, targets } from '@job-pilot/db/schema/profile';
import { eventListing, jobPosting, source } from '@job-pilot/db/schema/sources';
import type { CvContent } from '@job-pilot/shared/cv';
import { messages } from '@job-pilot/shared/limits';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { preparePack } from './prepare-pack.ts';

const url = process.env.TEST_DATABASE_URL;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

const master: CvContent = {
  header: {
    fullName: 'Jan Novak',
    headline: 'Brand Lead',
    location: 'Praha',
    email: null,
    phone: null,
    links: [],
  },
  summary: 'Brand lead.',
  experience: [],
  education: [],
  skills: ['Brand'],
  languages: [],
  projects: [],
};
const tailored = { ...master, header: { ...master.header, headline: 'Head of Brand' } };

describe.skipIf(!url)('preparePack', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const generateObject = vi.fn();
  const generateText = vi.fn();
  const handler = preparePack({ db, llm: { generateObject, generateText } as never, log });
  let userId = '';

  const setup = async ({
    type,
    withMaster = true,
  }: {
    type: 'job' | 'event';
    withMaster?: boolean;
  }) => {
    const [u] = await db
      .insert(user)
      .values({ name: 'Jan Novak', email: `jan-${randomUUID()}@example.com` })
      .returning({ id: user.id });
    userId = (u as { id: string }).id;
    await db.insert(profile).values({
      userId,
      fullName: 'Jan Novak',
      skills: ['Brand'],
      salaryMin: 120000,
      salaryMax: 150000,
      salaryCurrency: 'CZK',
      salaryPeriod: 'month',
      noticePeriod: '2_months',
      confirmedAt: new Date(),
    });
    await db
      .insert(targets)
      .values({ userId, roles: ['Head of Brand'], locations: ['Praha'], workFormats: ['remote'] });
    if (withMaster) {
      await db.insert(cv).values({ userId, kind: 'master', status: 'confirmed', content: master });
    }
    const [src] = await db.select().from(source).limit(1);
    if (!src) throw new Error('No source row in the test DB');
    let target: { jobPostingId?: string; eventListingId?: string };
    if (type === 'job') {
      const [j] = await db
        .insert(jobPosting)
        .values({
          sourceId: src.id,
          url: `https://x/${randomUUID()}`,
          canonicalUrl: `https://x/${randomUUID()}`,
          dedupeKey: randomUUID(),
          title: 'Head of Brand',
          company: 'Acme',
          description: 'Hledáme šéfa značky.',
          language: 'cs',
          raw: {},
        })
        .returning({ id: jobPosting.id });
      target = { jobPostingId: (j as { id: string }).id };
    } else {
      const [e] = await db
        .insert(eventListing)
        .values({
          sourceId: src.id,
          url: `https://x/${randomUUID()}`,
          dedupeKey: randomUUID(),
          title: 'Brand meetup',
          startsAt: new Date(Date.now() + 864e5),
          raw: {},
        })
        .returning({ id: eventListing.id });
      target = { eventListingId: (e as { id: string }).id };
    }
    const [o] = await db
      .insert(opportunity)
      .values({ userId, type, ...target, route: type === 'job' ? 'direct' : 'event' })
      .returning({ id: opportunity.id });
    const [p] = await db
      .insert(pipelineItem)
      .values({
        userId,
        opportunityId: (o as { id: string }).id,
        route: type === 'job' ? 'direct' : 'event',
      })
      .returning({ id: pipelineItem.id });
    return (p as { id: string }).id;
  };

  const run = (id: string) => handler({ id: 'j', data: { pipelineItemId: id } });
  const drafts = (id: string) =>
    db.select().from(draft).where(eq(draft.pipelineItemId, id)).orderBy(asc(draft.position));
  const item = async (id: string) =>
    (await db.select().from(pipelineItem).where(eq(pipelineItem.id, id)))[0];

  beforeEach(async () => {
    generateObject.mockReset();
    generateText.mockReset();
    generateText.mockResolvedValue({ text: ' text ' });
    generateObject.mockImplementation(async ({ task }: { task: string }) => ({
      object:
        task === 'write_cv'
          ? { cv: tailored, changes: ['Headline matched to Head of Brand', 'Skills reordered'] }
          : { registrationSteps: ['Open the link', 'Register'], prepNotes: 'Talking points:\n- a' },
    }));
    if (userId) await db.delete(user).where(eq(user.id, userId));
    userId = '';
  });
  afterAll(async () => {
    if (userId) await db.delete(user).where(eq(user.id, userId));
    await close();
  });

  it('direct: special CV, four drafts in order, ready_to_send', async () => {
    const id = await setup({ type: 'job' });
    await run(id);
    const specials = await db.select().from(cv).where(eq(cv.pipelineItemId, id));
    expect(specials).toHaveLength(1);
    expect(specials[0]).toMatchObject({
      kind: 'special',
      status: 'ready_to_send',
      origin: 'generated',
      content: tailored,
      changes: ['Headline matched to Head of Brand', 'Skills reordered'],
    });
    const rows = await drafts(id);
    expect(rows.map((d) => [d.kind, d.label, d.position])).toEqual([
      ['cover_text', null, 0],
      ['form_answer', 'Why this company?', 1],
      ['form_answer', 'Salary expectations', 2],
      ['form_answer', 'Notice period', 3],
    ]);
    expect(rows[2]?.body).toBe('120 000–150 000 Kč měsíčně');
    expect(rows[3]?.body).toBe('2 měsíce');
    expect(await item(id)).toMatchObject({ status: 'ready_to_send', failureReason: null });
  });

  it('event: two event_prep drafts and no CV', async () => {
    const id = await setup({ type: 'event' });
    await run(id);
    const rows = await drafts(id);
    expect(rows.map((d) => [d.kind, d.label])).toEqual([
      ['event_prep', 'Registration steps'],
      ['event_prep', 'Prep notes'],
    ]);
    expect(rows[0]?.body).toBe('- Open the link\n- Register');
    expect(await db.select().from(cv).where(eq(cv.pipelineItemId, id))).toHaveLength(0);
    expect((await item(id))?.status).toBe('ready_to_send');
  });

  it('re-run replaces drafts and the special CV', async () => {
    const id = await setup({ type: 'job' });
    await run(id);
    await db.update(pipelineItem).set({ status: 'preparing' }).where(eq(pipelineItem.id, id));
    await run(id);
    expect(await drafts(id)).toHaveLength(4);
    expect(await db.select().from(cv).where(eq(cv.pipelineItemId, id))).toHaveLength(1);
  });

  it('skips items that are not preparing', async () => {
    const id = await setup({ type: 'job' });
    await db.update(pipelineItem).set({ status: 'sent' }).where(eq(pipelineItem.id, id));
    await run(id);
    expect(generateText).not.toHaveBeenCalled();
    expect(await drafts(id)).toHaveLength(0);
  });

  it('fails without a master CV', async () => {
    const id = await setup({ type: 'job', withMaster: false });
    await run(id);
    expect(await item(id)).toMatchObject({ status: 'failed', failureReason: messages.packFailed });
    expect(await drafts(id)).toHaveLength(0);
  });

  it('fails (and does not throw) when the llm errors', async () => {
    const id = await setup({ type: 'job' });
    generateText.mockRejectedValue(new Error('boom'));
    await expect(run(id)).resolves.toBeUndefined();
    expect(await item(id)).toMatchObject({ status: 'failed', failureReason: messages.packFailed });
    expect(await db.select().from(cv).where(eq(cv.pipelineItemId, id))).toHaveLength(0);
  });
});
