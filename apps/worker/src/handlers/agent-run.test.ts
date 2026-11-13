import { randomUUID } from 'node:crypto';
import { createDb } from '@job-pilot/db/client';
import { agentRun } from '@job-pilot/db/schema/agent';
import { user } from '@job-pilot/db/schema/auth';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { profile, schedule, targets } from '@job-pilot/db/schema/profile';
import { eventListing, jobPosting, source } from '@job-pilot/db/schema/sources';
import { runStepKeys } from '@job-pilot/shared/enums';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentRunHandler } from './agent-run.ts';

const url = process.env.TEST_DATABASE_URL;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

describe.skipIf(!url)('agentRunHandler', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const tag = randomUUID().slice(0, 8);
  const city = `Testville${tag}`;
  const word = `zxq${tag}`;
  const jobIds: string[] = [];
  let eventId = '';
  let userId = '';
  let sourceId = '';

  const generateObject = vi.fn();
  const handler = agentRunHandler({ db, llm: { generateObject } as never, log });

  const newRun = async () => {
    const [r] = await db
      .insert(agentRun)
      .values({ userId, trigger: 'manual' })
      .returning({ id: agentRun.id });
    return (r as { id: string }).id;
  };
  const exec = async () => {
    const runId = await newRun();
    await handler({ id: 'j', data: { runId } });
    const [row] = await db.select().from(agentRun).where(eq(agentRun.id, runId));
    return row as typeof agentRun.$inferSelect;
  };
  const opps = () => db.select().from(opportunity).where(eq(opportunity.userId, userId));

  beforeAll(async () => {
    const [s] = await db.select({ id: source.id }).from(source).limit(1);
    if (!s) throw new Error('seed sources first');
    sourceId = s.id;
    for (const n of [1, 2, 3]) {
      const [j] = await db
        .insert(jobPosting)
        .values({
          sourceId,
          url: `https://x/${tag}/${n}`,
          canonicalUrl: `https://x/${tag}/${n}`,
          dedupeKey: `${tag}-${n}`,
          title: `${word} Developer ${n}`,
          company: 'Acme',
          city,
          raw: {},
        })
        .returning({ id: jobPosting.id });
      jobIds.push((j as { id: string }).id);
    }
    const [e] = await db
      .insert(eventListing)
      .values({
        sourceId,
        url: `https://x/${tag}/e`,
        dedupeKey: `${tag}-e`,
        title: 'Dev meetup',
        startsAt: new Date(Date.now() + 86_400_000),
        city,
        raw: {},
      })
      .returning({ id: eventListing.id });
    eventId = (e as { id: string }).id;
  });

  beforeEach(async () => {
    generateObject.mockReset();
    generateObject.mockImplementation(async ({ prompt }: { prompt: { name: string } }) => ({
      object:
        prompt.name === 'rank-job'
          ? { fitScore: 80, why: 'Matches your skills', gapNote: null }
          : { fitScore: 20, why: 'Meetup', gapNote: 'Low relevance' },
    }));
    if (userId) await db.delete(user).where(eq(user.id, userId));
    const [u] = await db
      .insert(user)
      .values({ name: 'R', email: `r-${randomUUID()}@example.com` })
      .returning({ id: user.id });
    userId = (u as { id: string }).id;
    await db.insert(profile).values({ userId, fullName: 'R', skills: [word] });
    await db.insert(schedule).values({ userId });
    await db.insert(targets).values({
      userId,
      roles: [`${word} Developer`],
      locations: [city],
      workFormats: ['onsite'],
    });
  });

  afterAll(async () => {
    if (userId) await db.delete(user).where(eq(user.id, userId));
    await db.delete(jobPosting).where(inArray(jobPosting.id, jobIds));
    await db.delete(eventListing).where(eq(eventListing.id, eventId));
    await close();
  });

  it('ranks, stores opportunities and finishes the run', async () => {
    const run = await exec();
    expect(run.error).toBeNull();
    expect(run.status).toBe('succeeded');
    expect(run.candidatesCount).toBe(4);
    expect(run.newCount).toBe(3);
    expect(run.startedAt).not.toBeNull();
    expect(run.finishedAt).not.toBeNull();
    expect(run.steps).toEqual(runStepKeys.map((key) => ({ key, status: 'done' })));
    const rows = await opps();
    expect(rows).toHaveLength(4);
    const jobRows = rows.filter((r) => r.type === 'job');
    expect(jobRows).toHaveLength(3);
    expect(jobRows[0]).toMatchObject({
      fitScore: 80,
      route: 'direct',
      feedStatus: 'new',
      agentRunId: run.id,
    });
    expect(rows.find((r) => r.type === 'event')).toMatchObject({ route: 'event', fitScore: 20 });
    const [sched] = await db.select().from(schedule).where(eq(schedule.userId, userId));
    expect(sched?.lastRunAt).not.toBeNull();
  });

  it('does not duplicate opportunities on a second run', async () => {
    await exec();
    const second = await exec();
    expect(second.status).toBe('succeeded');
    expect(second.candidatesCount).toBe(0);
    expect(await opps()).toHaveLength(4);
  });

  it('skips one failed ranking and saves the rest', async () => {
    let n = 0;
    generateObject.mockImplementation(async ({ prompt }: { prompt: { name: string } }) => {
      if (prompt.name === 'rank-job' && n++ === 0) throw new Error('boom');
      return { object: { fitScore: 70, why: 'ok', gapNote: null } };
    });
    const run = await exec();
    expect(run.status).toBe('succeeded');
    expect(await opps()).toHaveLength(3);
  });

  it('skips a run that is not queued', async () => {
    const runId = await newRun();
    await db.update(agentRun).set({ status: 'cancelled' }).where(eq(agentRun.id, runId));
    await handler({ id: 'j', data: { runId } });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('fails clearly when targets are missing', async () => {
    await db.delete(targets).where(eq(targets.userId, userId));
    const run = await exec();
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/targets/i);
    expect(run.finishedAt).not.toBeNull();
    expect(await opps()).toHaveLength(0);
  });

  it('fails when every ranking fails', async () => {
    generateObject.mockRejectedValue(new Error('down'));
    const run = await exec();
    expect(run.status).toBe('failed');
    expect(run.steps.find((s) => s.key === 'rank_matches')?.status).toBe('failed');
  });
});
