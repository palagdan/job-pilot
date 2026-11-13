import type { CvContent } from '@job-pilot/shared/cv';
import type { PipelineStatus, Route, WorkFormat } from '@job-pilot/shared/enums';
import { runStepKeys } from '@job-pilot/shared/enums';
import { eq, inArray, like } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { activity } from '../schema/activity.ts';
import { agentRun } from '../schema/agent.ts';
import { cv } from '../schema/cv.ts';
import { opportunity } from '../schema/opportunities.ts';
import { draft, followUp, note, pipelineItem } from '../schema/pipeline.ts';
import { eventListing, jobPosting, source } from '../schema/sources.ts';

/** Postings and events made by this seed (global tables): `demo-seed-…` dedupe keys. */
const KEY = 'demo-seed-';
const DAY = 86_400_000;
const HOUR = 3_600_000;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const masterContent: CvContent = {
  header: {
    fullName: 'Demo User',
    headline: 'Head of Performance Marketing',
    location: 'Prague, Czechia',
    email: 'demo@jobpilot.local',
    phone: null,
    links: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/demo-user' }],
  },
  summary:
    'Performance marketing lead with 10+ years in iGaming, ad-tech and fintech. Scaled paid acquisition across ' +
    'five markets and built teams that own budget, creative testing and analytics end to end.',
  experience: [
    {
      company: 'Northwind Gaming',
      title: 'Head of Performance Marketing',
      location: 'Prague',
      start: '2021-03',
      end: null,
      bullets: [
        'Scaled paid acquisition across 5 markets at a stable CAC',
        'Built and led a team of 8 (media buying, creative, analytics)',
        'Moved 60% of spend to in-house bidding models',
      ],
    },
    {
      company: 'Adverta',
      title: 'Performance Marketing Manager',
      location: 'Prague',
      start: '2017-01',
      end: '2021-02',
      bullets: [
        'Managed EUR 4M yearly budget across Google, Meta and programmatic',
        'Launched the first LTV model',
      ],
    },
  ],
  education: [
    {
      school: 'Prague University of Economics and Business',
      degree: 'MSc',
      field: 'Marketing',
      start: '2010-09',
      end: '2015-06',
    },
  ],
  skills: ['Paid acquisition', 'Team lead', 'Analytics', 'Budget planning', 'Creative testing'],
  languages: [
    { language: 'English', level: 'professional' },
    { language: 'Czech', level: 'native' },
  ],
  projects: [],
};

type JobSpec = {
  slug: string;
  title: string;
  company: string;
  city: string;
  workFormats: WorkFormat[];
  fit: number;
  why: string;
  gap?: string;
};

/** New cards on Today. */
const todayJobs: JobSpec[] = [
  {
    slug: 'today-1',
    title: 'Head of Growth',
    company: 'Kiwi Labs',
    city: 'Prague',
    workFormats: ['hybrid'],
    fit: 87,
    why: 'Leads paid acquisition across several markets, like your last two roles.',
    gap: 'Asks for B2B SaaS; your background is mostly B2C.',
  },
  {
    slug: 'today-2',
    title: 'Performance Marketing Lead',
    company: 'Rohlik Group',
    city: 'Prague',
    workFormats: ['onsite', 'hybrid'],
    fit: 74,
    why: 'Large paid budget and a team of 6 to lead.',
  },
  {
    slug: 'today-3',
    title: 'Director of Acquisition',
    company: 'Productboard',
    city: 'Remote EU',
    workFormats: ['remote'],
    fit: 61,
    why: 'Remote EU, owns acquisition strategy and budget.',
    gap: 'Prefers experience with product-led growth.',
  },
];

type PipelineSpec = {
  slug: string;
  title: string;
  company: string;
  status: Exclude<PipelineStatus, 'registered'>;
  sentDaysAgo?: number;
  /** Pending follow-up, days from now (negative = overdue), with its sequence. */
  followUp?: { inDays: number; sequence: 1 | 2 };
  interviewInDays?: number;
  note?: string;
};

/** One job per pipeline status (events cover `registered`). */
const pipelineJobs: PipelineSpec[] = [
  { slug: 'p-preparing', title: 'Head of Marketing', company: 'Mews', status: 'preparing' },
  {
    slug: 'p-ready',
    title: 'Head of Performance Marketing',
    company: 'Company A',
    status: 'ready_to_send',
  },
  {
    slug: 'p-sent-due',
    title: 'Head of Growth',
    company: 'Company D',
    status: 'sent',
    sentDaysAgo: 5,
    followUp: { inDays: 0, sequence: 1 },
  },
  {
    slug: 'p-sent',
    title: 'Growth Marketing Manager',
    company: 'Kentico',
    status: 'sent',
    sentDaysAgo: 2,
    followUp: { inDays: 3, sequence: 1 },
  },
  {
    slug: 'p-replied',
    title: 'Head of Acquisition',
    company: 'Company B',
    status: 'replied',
    sentDaysAgo: 8,
    note: 'Recruiter Jana asked for availability next week.',
  },
  {
    slug: 'p-interview',
    title: 'CMO',
    company: 'Company C',
    status: 'interview',
    sentDaysAgo: 12,
    interviewInDays: 3,
  },
  {
    slug: 'p-offer',
    title: 'VP Marketing',
    company: 'Pipedrive',
    status: 'offer',
    sentDaysAgo: 25,
  },
  {
    slug: 'p-no-reply',
    title: 'Marketing Director',
    company: 'Company E',
    status: 'no_reply',
    sentDaysAgo: 16,
  },
  {
    slug: 'p-rejected',
    title: 'Head of Paid Media',
    company: 'Avast',
    status: 'rejected',
    sentDaysAgo: 20,
  },
  { slug: 'p-skipped', title: 'Head of Brand', company: 'Alza', status: 'skipped' },
  { slug: 'p-failed', title: 'Digital Marketing Lead', company: 'Notino', status: 'failed' },
];

const insertJob = async (
  tx: Tx,
  sourceId: string,
  spec: { slug: string; title: string; company: string; city?: string; workFormats?: WorkFormat[] },
  now: Date,
) => {
  const url = `https://example.com/jobs/${KEY}${spec.slug}`;
  const [row] = await tx
    .insert(jobPosting)
    .values({
      sourceId,
      url,
      canonicalUrl: url,
      dedupeKey: `${KEY}${spec.slug}`,
      title: spec.title,
      company: spec.company,
      description: `${spec.title} at ${spec.company}. Demo posting created by the seed.`,
      locationRaw: spec.city ?? 'Prague',
      city: spec.city ?? 'Prague',
      workFormats: spec.workFormats ?? ['hybrid'],
      postedAt: new Date(now.getTime() - 2 * DAY),
      raw: { demo: true },
    })
    .returning({ id: jobPosting.id });
  if (!row) throw new Error('job posting insert returned no row');
  return row.id;
};

const sentFollowUpText = (company: string) =>
  `Hi, I applied for the role at ${company} last week and wanted to check whether you had a chance to look at my application. Happy to share more details.`;

/**
 * Full demo data for the demo user (M5): confirmed master CV, a finished run with new Today cards (jobs + an
 * event), and a pipeline item in every status with special CVs, drafts, follow-ups and a note.
 * Re-running replaces it: the demo user's opportunities, pipeline, CVs, runs and activity are deleted first
 * (uploads are kept).
 */
export const seedDemoData = async (db: Db, userId: string, now = new Date()) =>
  db.transaction(async (tx) => {
    // Reset: opportunities cascade to pipeline items → drafts, follow-ups, notes, special CVs.
    await tx.delete(opportunity).where(eq(opportunity.userId, userId));
    await tx.delete(cv).where(eq(cv.userId, userId));
    await tx.delete(agentRun).where(eq(agentRun.userId, userId));
    await tx.delete(activity).where(eq(activity.userId, userId));
    await tx.delete(jobPosting).where(like(jobPosting.dedupeKey, `${KEY}%`));
    await tx.delete(eventListing).where(like(eventListing.dedupeKey, `${KEY}%`));

    const sources = await tx
      .select({ id: source.id, key: source.key })
      .from(source)
      .where(inArray(source.key, ['jobs-cz', 'meetup-prague']));
    const jobSourceId = sources.find((s) => s.key === 'jobs-cz')?.id;
    const eventSourceId = sources.find((s) => s.key === 'meetup-prague')?.id;
    if (!jobSourceId || !eventSourceId)
      throw new Error('Seed sources first (jobs-cz, meetup-prague)');

    const [master] = await tx
      .insert(cv)
      .values({
        userId,
        kind: 'master',
        origin: 'generated',
        version: 1,
        status: 'confirmed',
        content: masterContent,
        changes: [
          'Headline rewritten for your target roles',
          'Bullets start with results',
          'Skills ordered by your targets',
        ],
        pageCount: 1,
        confirmedAt: new Date(now.getTime() - 10 * DAY),
        createdAt: new Date(now.getTime() - 10 * DAY),
      })
      .returning({ id: cv.id });
    if (!master) throw new Error('master CV insert returned no row');

    const [run] = await tx
      .insert(agentRun)
      .values({
        userId,
        trigger: 'scheduled',
        status: 'succeeded',
        steps: runStepKeys.map((key) => ({ key, status: 'done' as const })),
        candidatesCount: 25,
        newCount: todayJobs.length + 1,
        startedAt: new Date(now.getTime() - 2 * HOUR),
        finishedAt: new Date(now.getTime() - 2 * HOUR + 4 * 60_000),
      })
      .returning({ id: agentRun.id });

    // Today: new job cards + one event.
    for (const job of todayJobs) {
      const jobPostingId = await insertJob(tx, jobSourceId, job, now);
      await tx.insert(opportunity).values({
        userId,
        agentRunId: run?.id,
        type: 'job',
        jobPostingId,
        fitScore: job.fit,
        why: job.why,
        gapNote: job.gap ?? null,
        route: 'direct',
        routeReason: 'Apply on the company page',
      });
    }
    const event = async (slug: string, title: string, startsInDays: number) => {
      const url = `https://example.com/events/${KEY}${slug}`;
      const [row] = await tx
        .insert(eventListing)
        .values({
          sourceId: eventSourceId,
          url,
          dedupeKey: `${KEY}${slug}`,
          title,
          organizer: 'Prague Growth Club',
          city: 'Prague',
          startsAt: new Date(now.getTime() + startsInDays * DAY),
          raw: { demo: true },
        })
        .returning({ id: eventListing.id });
      if (!row) throw new Error('event insert returned no row');
      return row.id;
    };
    await tx.insert(opportunity).values({
      userId,
      agentRunId: run?.id,
      type: 'event',
      eventListingId: await event('today-event', 'Performance Marketing Meetup', 9),
      fitScore: 68,
      why: 'Hiring managers from three of your target companies speak here.',
      route: 'event',
      routeReason: 'Meet the hiring manager in person',
    });

    // Pipeline: one item per status.
    const addItem = async (
      opportunityValues: Omit<typeof opportunity.$inferInsert, 'userId'>,
      values: Omit<typeof pipelineItem.$inferInsert, 'userId' | 'opportunityId'>,
    ) => {
      const [opp] = await tx
        .insert(opportunity)
        .values({
          userId,
          feedStatus: 'pursued',
          feedStatusChangedAt: values.createdAt,
          ...opportunityValues,
        })
        .returning({ id: opportunity.id });
      const [item] = await tx
        .insert(pipelineItem)
        .values({ userId, opportunityId: opp?.id ?? '', ...values })
        .returning({ id: pipelineItem.id });
      if (!item) throw new Error('pipeline item insert returned no row');
      return item.id;
    };

    for (const [i, spec] of pipelineJobs.entries()) {
      const jobPostingId = await insertJob(tx, jobSourceId, spec, now);
      const sentAt =
        spec.sentDaysAgo === undefined ? null : new Date(now.getTime() - spec.sentDaysAgo * DAY);
      const createdAt = new Date((sentAt ?? now).getTime() - (i + 1) * HOUR);
      const followUpAt = spec.followUp
        ? new Date(now.getTime() + spec.followUp.inDays * DAY - HOUR)
        : null;
      const route: Route = 'direct';
      const itemId = await addItem(
        {
          type: 'job',
          jobPostingId,
          fitScore: 70 + (i % 3) * 7,
          why: 'Matches your target roles.',
          route,
        },
        {
          route,
          status: spec.status,
          statusChangedAt: sentAt ?? createdAt,
          sentAt,
          interviewAt:
            spec.interviewInDays === undefined
              ? null
              : new Date(now.getTime() + spec.interviewInDays * DAY),
          nextFollowUpAt: followUpAt,
          failureReason:
            spec.status === 'failed'
              ? 'We could not prepare this pack. Try again or skip it.'
              : null,
          createdAt,
        },
      );

      const hasPack =
        spec.status !== 'preparing' && spec.status !== 'failed' && spec.status !== 'skipped';
      if (hasPack) {
        await tx.insert(cv).values({
          userId,
          kind: 'special',
          origin: 'generated',
          status: sentAt ? 'sent' : 'ready_to_send',
          content: { ...masterContent, header: { ...masterContent.header, headline: spec.title } },
          changes: [
            'Headline matches the role',
            `Bullets reordered for ${spec.company}`,
            'Keywords from the posting',
          ],
          basedOnCvId: master.id,
          pipelineItemId: itemId,
          pageCount: 1,
          sentAt,
          createdAt,
        });
        await tx.insert(draft).values([
          {
            pipelineItemId: itemId,
            kind: 'cover_text',
            body: `Hello ${spec.company} team, I lead performance marketing and would like to help you grow as ${spec.title}.`,
            position: 0,
          },
          {
            pipelineItemId: itemId,
            kind: 'form_answer',
            label: 'Why this company?',
            body: `${spec.company} grows fast in markets I know well.`,
            position: 1,
          },
          {
            pipelineItemId: itemId,
            kind: 'form_answer',
            label: 'Salary expectations',
            body: '120 000 - 150 000 CZK per month',
            position: 2,
          },
          {
            pipelineItemId: itemId,
            kind: 'form_answer',
            label: 'Notice period',
            body: '2 months',
            position: 3,
          },
        ]);
      }
      if (spec.followUp) {
        const [text] = await tx
          .insert(draft)
          .values({
            pipelineItemId: itemId,
            kind: 'follow_up',
            body: sentFollowUpText(spec.company),
            position: 10,
          })
          .returning({ id: draft.id });
        await tx.insert(followUp).values({
          pipelineItemId: itemId,
          sequence: spec.followUp.sequence,
          dueAt: followUpAt ?? now,
          draftId: spec.followUp.inDays <= 0 ? text?.id : null,
        });
      }
      if (spec.status === 'no_reply' && sentAt) {
        await tx.insert(followUp).values([
          {
            pipelineItemId: itemId,
            sequence: 1,
            dueAt: new Date(sentAt.getTime() + 5 * DAY),
            status: 'done',
            completedAt: new Date(sentAt.getTime() + 5 * DAY),
          },
          {
            pipelineItemId: itemId,
            sequence: 2,
            dueAt: new Date(sentAt.getTime() + 12 * DAY),
            status: 'done',
            completedAt: new Date(sentAt.getTime() + 12 * DAY),
          },
        ]);
      }
      if (spec.note) await tx.insert(note).values({ pipelineItemId: itemId, body: spec.note });
    }

    // Registered event.
    const registeredAt = new Date(now.getTime() - DAY);
    const eventItem = await addItem(
      {
        type: 'event',
        eventListingId: await event('p-registered', 'Growth Marketing Meetup', 6),
        fitScore: 72,
        route: 'event',
      },
      {
        route: 'event',
        status: 'registered',
        statusChangedAt: registeredAt,
        registeredAt,
        createdAt: new Date(registeredAt.getTime() - HOUR),
      },
    );
    await tx.insert(draft).values({
      pipelineItemId: eventItem,
      kind: 'event_prep',
      body: 'Talk to the speakers from Kiwi Labs and Rohlik: both are hiring for growth roles.',
      position: 0,
    });

    return { today: todayJobs.length + 1, pipeline: pipelineJobs.length + 1 };
  });
