import { scheduleDefaults } from '@job-pilot/shared/schedule';
import { eq } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { user } from '../schema/auth.ts';
import { profile, profileProof, schedule, targets } from '../schema/profile.ts';

export const demoUserEmail = 'demo@jobpilot.local';

/**
 * One onboarded user so screens have data before Google sign-in exists.
 * Re-running resets this user's profile, targets and schedule to the values below.
 * CVs, Today items and the pipeline come from `seedDemoData`.
 */
export const seedDemoUser = async (db: Db) =>
  db.transaction(async (tx) => {
    const now = new Date();
    const [demo] = await tx
      .insert(user)
      .values({
        name: 'Demo User',
        email: demoUserEmail,
        emailVerified: true,
        timezone: 'Europe/Prague',
        onboardingStep: 'schedule',
        onboardingCompletedAt: now,
      })
      .onConflictDoUpdate({
        target: user.email,
        set: { onboardingStep: 'schedule', onboardingCompletedAt: now, pausedAt: null },
      })
      .returning({ id: user.id, email: user.email });
    if (!demo) throw new Error('Demo user upsert returned no row');
    const userId = demo.id;

    const profileValues = {
      fullName: 'Demo User',
      currentTitle: 'Head of Performance Marketing',
      experience: '10_plus',
      location: 'Prague, Czechia',
      linkedinUrl: 'https://www.linkedin.com/in/demo-user',
      portfolioUrl: null,
      skills: ['Paid acquisition', 'Team lead', 'Analytics', 'Budget planning'],
      summary: 'Performance marketing lead with 10+ years in iGaming, ad-tech and fintech.',
      salaryMin: 120_000,
      salaryMax: 150_000,
      salaryCurrency: 'CZK',
      salaryPeriod: 'month',
      noticePeriod: '2_months',
      languages: [
        { language: 'English', level: 'professional' },
        { language: 'Czech', level: 'native' },
      ],
      confirmedAt: now,
    } satisfies Omit<typeof profile.$inferInsert, 'userId'>;
    await tx
      .insert(profile)
      .values({ userId, ...profileValues })
      .onConflictDoUpdate({ target: profile.userId, set: profileValues });

    await tx.delete(profileProof).where(eq(profileProof.userId, userId));
    await tx.insert(profileProof).values(
      ['Scaled paid acquisition across 5 markets', 'Built and led a team of 8'].map(
        (text, position) => ({
          userId,
          text,
          position,
        }),
      ),
    );

    const targetsValues = {
      roles: ['Head of Performance Marketing', 'CMO', 'Head of Growth'],
      locations: ['Prague', 'Remote EU'],
      workFormats: ['remote', 'hybrid'],
      exclusions: ['No agencies', 'No relocation'],
      findJobs: true,
      findEvents: true,
    } satisfies Omit<typeof targets.$inferInsert, 'userId'>;
    await tx
      .insert(targets)
      .values({ userId, ...targetsValues })
      .onConflictDoUpdate({ target: targets.userId, set: targetsValues });

    // `nextRunAt` stays null: computing it is domain logic (M1 "compute next_run_at"), not seed data.
    const scheduleValues = { ...scheduleDefaults, nextRunAt: null };
    await tx
      .insert(schedule)
      .values({ userId, ...scheduleValues })
      .onConflictDoUpdate({ target: schedule.userId, set: scheduleValues });

    return demo;
  });
