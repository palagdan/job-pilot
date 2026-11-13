import { randomUUID } from 'node:crypto';
import { createDb } from '@job-pilot/db/client';
import { agentRun } from '@job-pilot/db/schema/agent';
import { user } from '@job-pilot/db/schema/auth';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { followUp, pipelineItem } from '@job-pilot/db/schema/pipeline';
import { eventListing, jobPosting, source } from '@job-pilot/db/schema/sources';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDigest } from './run-digest.ts';

const url = process.env.TEST_DATABASE_URL;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

describe.skipIf(!url)('runDigest', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const send = vi.fn();
  const now = new Date('2026-11-13T08:00:00Z');
  const handler = runDigest({ db, queue: { send }, log, now: () => now });
  const tag = randomUUID().slice(0, 8);
  let userId: string;
  let sourceId: string;

  const posting = async (company: string, title: string) => {
    const [row] = await db
      .insert(jobPosting)
      .values({
        sourceId,
        url: `https://x.example/${tag}/${company}`,
        canonicalUrl: `https://x.example/${tag}/${company}`,
        dedupeKey: `${tag}-${company}`,
        title,
        company,
        raw: {},
      })
      .returning({ id: jobPosting.id });
    return (row as { id: string }).id;
  };
  const run = async (status: 'succeeded' | 'failed') => {
    const [row] = await db
      .insert(agentRun)
      .values({ userId, trigger: 'scheduled', status })
      .returning({ id: agentRun.id });
    return (row as { id: string }).id;
  };

  beforeAll(async () => {
    const [u] = await db
      .insert(user)
      .values({ name: 'Digest Test', email: `digest-${tag}@example.com` })
      .returning({ id: user.id });
    userId = (u as { id: string }).id;
    const [s] = await db
      .insert(source)
      .values({
        key: `test-${tag}`,
        name: 'Test',
        kind: 'job',
        baseUrl: 'https://x.example',
        apifyActorId: 'x',
        cron: '0 0 * * *',
        enabled: false,
      })
      .returning({ id: source.id });
    sourceId = (s as { id: string }).id;
  });
  beforeEach(() => send.mockReset());
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, userId)); // cascades opportunities, pipeline, runs
    await db.delete(jobPosting).where(like(jobPosting.dedupeKey, `${tag}-%`));
    await db.delete(eventListing).where(like(eventListing.dedupeKey, `${tag}-%`));
    await db.delete(source).where(eq(source.id, sourceId));
    await close();
  });

  it('sends one digest with counts, ready packs and due follow-ups', async () => {
    // An earlier pack ready to send + a follow-up due today.
    const older = await db
      .insert(opportunity)
      .values({
        userId,
        type: 'job',
        jobPostingId: await posting('Company A', 'CMO'),
        feedStatus: 'pursued',
      })
      .returning({ id: opportunity.id });
    const [ready] = await db
      .insert(pipelineItem)
      .values({
        userId,
        opportunityId: (older[0] as { id: string }).id,
        route: 'direct',
        status: 'ready_to_send',
      })
      .returning({ id: pipelineItem.id });
    const sentOpp = await db
      .insert(opportunity)
      .values({
        userId,
        type: 'job',
        jobPostingId: await posting('Company C', 'Head of Growth'),
        feedStatus: 'pursued',
      })
      .returning({ id: opportunity.id });
    const [sent] = await db
      .insert(pipelineItem)
      .values({
        userId,
        opportunityId: (sentOpp[0] as { id: string }).id,
        route: 'direct',
        status: 'sent',
      })
      .returning({ id: pipelineItem.id });
    await db.insert(followUp).values({
      pipelineItemId: (sent as { id: string }).id,
      sequence: 1,
      dueAt: new Date('2026-11-12T08:00:00Z'),
    });
    await db.insert(followUp).values({
      pipelineItemId: (ready as { id: string }).id,
      sequence: 1,
      dueAt: new Date('2026-12-01T08:00:00Z'),
    }); // not due yet

    const runId = await run('succeeded');
    for (const c of ['Company X', 'Company Y']) {
      await db
        .insert(opportunity)
        .values({ userId, agentRunId: runId, type: 'job', jobPostingId: await posting(c, 'Role') });
    }
    const [ev] = await db
      .insert(eventListing)
      .values({
        sourceId,
        url: `https://e.example/${tag}`,
        dedupeKey: `${tag}-meetup`,
        title: 'Growth Meetup',
        startsAt: new Date('2026-11-20T17:00:00Z'),
        raw: {},
      })
      .returning({ id: eventListing.id });
    await db.insert(opportunity).values({
      userId,
      agentRunId: runId,
      type: 'event',
      eventListingId: (ev as { id: string }).id,
    });

    await handler({ data: { runId } } as never);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('email.send', {
      template: 'run_digest',
      userId,
      dedupeKey: `run_digest:${runId}`,
      data: {
        newJobs: 2,
        newEvents: 1,
        readyToSend: { count: 1, companies: ['Company A'] },
        followUpsDue: { count: 1, companies: ['Company C'] },
      },
    });
  });

  it('sends nothing when the run found nothing new, failed, or does not exist', async () => {
    await handler({ data: { runId: await run('succeeded') } } as never);
    await handler({ data: { runId: await run('failed') } } as never);
    await handler({ data: { runId: randomUUID() } } as never);
    expect(send).not.toHaveBeenCalled();
  });
});
