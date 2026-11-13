import { upload } from '@job-pilot/db/schema/cv';
import { profile } from '@job-pilot/db/schema/profile';
import { apiErrorSchema } from '@job-pilot/shared/errors';
import { messages } from '@job-pilot/shared/limits';
import { profileSchema } from '@job-pilot/shared/profile';
import { scheduleSchema } from '@job-pilot/shared/schedule';
import { targetsViewSchema } from '@job-pilot/shared/targets';
import { uploadSchema } from '@job-pilot/shared/upload';
import { meSchema } from '@job-pilot/shared/user';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakePdf } from '../test/fixtures.ts';
import { createTestApp, testDatabaseUrl } from '../test/test-app.ts';

/**
 * Integration: the whole onboarding through the api on Postgres. The worker is simulated by marking the upload
 * parsed and pre-filling the profile (what Daniil's cv.parse job does). The clock is pinned to Fri 13 Nov 2026 11:00 CET.
 */
describe.skipIf(!testDatabaseUrl)('onboarding (integration)', () => {
  const t = createTestApp({ now: () => new Date('2026-11-13T10:00:00Z') });
  let h: Headers;
  let userId: string;
  let uploadId: string;

  beforeAll(async () => {
    await t.setup();
    ({ headers: h, userId } = await t.signIn({ name: 'Onboarding Test' }));
  });
  afterAll(() => t.teardown());

  const call = (method: string, path: string, body?: unknown) =>
    t.app.request(path, {
      method,
      headers:
        body === undefined
          ? h
          : { cookie: h.get('cookie') ?? '', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const me = async () => meSchema.parse(await (await call('GET', '/v1/me')).json());
  const error = async (res: Response) => apiErrorSchema.parse(await res.json()).error;

  const profileInput = {
    fullName: 'Onboarding Test',
    currentTitle: 'Head of Growth',
    experience: '10_plus',
    location: 'Prague, Czechia',
    linkedinUrl: 'https://www.linkedin.com/in/onboarding-test',
    portfolioUrl: null,
    skills: ['Paid acquisition', 'paid acquisition', 'Analytics'],
    salary: { min: 120000, max: 150000, currency: 'czk', period: 'month' },
    noticePeriod: '2_months',
    languages: [{ language: 'English', level: 'professional' }],
    proof: [{ text: 'Scaled paid acquisition across 5 markets' }],
  };
  const targetsInput = {
    roles: ['Head of Growth', 'CMO'],
    locations: ['Prague', 'Remote EU'],
    workFormats: ['remote', 'hybrid'],
    exclusions: ['No agencies'],
    findJobs: true,
    findEvents: true,
  };

  it('blocks later steps until earlier ones are done', async () => {
    expect((await call('PUT', '/v1/targets', targetsInput)).status).toBe(409);
    expect((await call('PUT', '/v1/profile', profileInput)).status).toBe(409);
    expect((await call('POST', '/v1/onboarding/complete')).status).toBe(409);
  });

  it('step 1: Continue needs an uploaded and parsed CV', async () => {
    const noCv = await call('PUT', '/v1/onboarding/links', {
      linkedinUrl: null,
      portfolioUrl: null,
    });
    expect(noCv.status).toBe(400);
    expect((await error(noCv)).message).toBe(messages.cvRequired);

    const form = new FormData();
    form.set('file', new File([fakePdf() as Uint8Array<ArrayBuffer>], 'cv.pdf'));
    const up = await t.app.request('/v1/uploads/cv', { method: 'POST', headers: h, body: form });
    uploadId = uploadSchema.parse(await up.json()).id;
    expect(
      (await call('PUT', '/v1/onboarding/links', { linkedinUrl: null, portfolioUrl: null })).status,
    ).toBe(409);

    // What the worker does: parse + pre-fill empty profile fields.
    await t.db
      .update(upload)
      .set({ parseStatus: 'parsed', pageCount: 2 })
      .where(eq(upload.id, uploadId));
    await t.db.insert(profile).values({
      userId,
      fullName: 'Parsed Name',
      currentTitle: 'Parsed Title',
      skills: ['From CV'],
    });

    const ok = await call('PUT', '/v1/onboarding/links', {
      linkedinUrl: 'https://linkedin.com/in/x',
      portfolioUrl: null,
    });
    expect(ok.status).toBe(200);
    expect((await me()).onboardingStep).toBe('confirm_profile');
  });

  it('step 2: profile is pre-filled, validated with spec copy, confirmed', async () => {
    const pre = profileSchema.parse(await (await call('GET', '/v1/profile')).json());
    expect(pre).toMatchObject({
      fullName: 'Parsed Name',
      linkedinUrl: 'https://linkedin.com/in/x',
      skills: ['From CV'],
    });

    const bad = await call('PUT', '/v1/profile', {
      ...profileInput,
      fullName: '',
      experience: null,
    });
    expect(bad.status).toBe(400);
    expect((await error(bad)).fields).toMatchObject({
      fullName: messages.fullNameRequired,
      experience: messages.experienceRequired,
    });

    const res = await call('PUT', '/v1/profile', profileInput);
    expect(res.status).toBe(200);
    const saved = profileSchema.parse(await res.json());
    expect(saved.skills).toEqual(['Paid acquisition', 'Analytics']); // duplicates ignored
    expect(saved.salary).toEqual({ min: 120000, max: 150000, currency: 'CZK', period: 'month' });
    expect(saved.proof).toHaveLength(1);
    expect((await me()).onboardingStep).toBe('set_targets');
  });

  it('step 3: targets default, merged patch is validated, save moves on', async () => {
    const defaults = targetsViewSchema.parse(await (await call('GET', '/v1/targets')).json());
    expect(defaults).toMatchObject({
      workFormats: ['remote', 'hybrid'],
      findJobs: true,
      findEvents: true,
    });

    expect((await call('PUT', '/v1/targets', { ...targetsInput, roles: [] })).status).toBe(400);
    expect((await call('PUT', '/v1/targets', targetsInput)).status).toBe(200);
    expect((await me()).onboardingStep).toBe('schedule');

    const off = await call('PATCH', '/v1/targets', { findJobs: false, findEvents: false });
    expect(off.status).toBe(400);
    expect((await error(off)).fields).toEqual({ findJobs: messages.lookForRequired });
  });

  it('step 4: schedule saves the time zone and the next run (TZ aware)', async () => {
    expect((await call('POST', '/v1/onboarding/complete')).status).toBe(409); // no schedule yet
    const bad = await call('PUT', '/v1/schedule', {
      frequency: 'weekly',
      runHour: 8,
      dayOfWeek: null,
      timezone: 'Europe/Prague',
      notifyEmail: true,
      notifyPush: false,
    });
    expect(bad.status).toBe(400);

    const res = await call('PUT', '/v1/schedule', {
      frequency: 'daily',
      runHour: 8,
      dayOfWeek: null,
      timezone: 'America/New_York',
      notifyEmail: true,
      notifyPush: false,
    });
    expect(res.status).toBe(200);
    // Pinned now = 13 Nov 10:00Z = 05:00 in New York → today 08:00 EST = 13:00Z.
    expect(scheduleSchema.parse(await res.json())).toMatchObject({
      timezone: 'America/New_York',
      nextRunAt: '2026-11-13T13:00:00.000Z',
    });
    expect((await me()).timezone).toBe('America/New_York');
  });

  it('complete: marks onboarding done, queues the master CV, is idempotent', async () => {
    const res = await call('POST', '/v1/onboarding/complete');
    expect(res.status).toBe(200);
    expect(meSchema.parse(await res.json()).onboardingCompletedAt).toBe('2026-11-13T10:00:00.000Z');
    expect(t.jobs.generateMaster).toEqual([{ userId, uploadId }]);

    expect((await call('POST', '/v1/onboarding/complete')).status).toBe(200);
    expect(t.jobs.generateMaster).toHaveLength(1);
  });

  it('after onboarding everything stays editable and the step never goes back', async () => {
    const patched = await call('PATCH', '/v1/profile', { currentTitle: 'CMO' });
    expect(profileSchema.parse(await patched.json()).currentTitle).toBe('CMO');
    expect((await call('PUT', '/v1/targets', targetsInput)).status).toBe(200);
    const now = await me();
    expect(now.onboardingStep).toBe('schedule');
    expect(now.onboardingCompletedAt).not.toBeNull();
  });
});
