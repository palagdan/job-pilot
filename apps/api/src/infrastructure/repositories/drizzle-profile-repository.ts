import type { Db } from '@job-pilot/db/client';
import { profile, profileProof } from '@job-pilot/db/schema/profile';
import type { Profile } from '@job-pilot/shared/profile';
import { asc, eq } from 'drizzle-orm';
import type {
  ProfileFields,
  ProfileRepository,
} from '../../application/ports/profile-repository.ts';

type Row = typeof profile.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const toColumns = (f: Partial<ProfileFields>): Partial<typeof profile.$inferInsert> => {
  const c: Partial<typeof profile.$inferInsert> = {};
  if (f.fullName !== undefined) c.fullName = f.fullName;
  if (f.currentTitle !== undefined) c.currentTitle = f.currentTitle;
  if (f.experience !== undefined) c.experience = f.experience;
  if (f.location !== undefined) c.location = f.location;
  if (f.linkedinUrl !== undefined) c.linkedinUrl = f.linkedinUrl;
  if (f.portfolioUrl !== undefined) c.portfolioUrl = f.portfolioUrl;
  if (f.skills !== undefined) c.skills = f.skills;
  if (f.noticePeriod !== undefined) c.noticePeriod = f.noticePeriod;
  if (f.languages !== undefined) c.languages = f.languages;
  if (f.salary !== undefined) {
    c.salaryMin = f.salary?.min ?? null;
    c.salaryMax = f.salary?.max ?? null;
    c.salaryCurrency = f.salary?.currency ?? null;
    c.salaryPeriod = f.salary?.period ?? null;
  }
  return c;
};

const toProfile = (
  row: Row | undefined,
  proof: { id: string; text: string }[],
): Profile & { confirmedAt: Date | null } => ({
  fullName: row?.fullName ?? null,
  currentTitle: row?.currentTitle ?? null,
  experience: row?.experience ?? null,
  location: row?.location ?? null,
  linkedinUrl: row?.linkedinUrl ?? null,
  portfolioUrl: row?.portfolioUrl ?? null,
  skills: row?.skills ?? [],
  salary:
    row?.salaryMin != null && row.salaryCurrency && row.salaryPeriod
      ? {
          min: row.salaryMin,
          max: row.salaryMax,
          currency: row.salaryCurrency,
          period: row.salaryPeriod,
        }
      : null,
  noticePeriod: row?.noticePeriod ?? null,
  languages: row?.languages ?? [],
  proof,
  confirmedAt: row?.confirmedAt ?? null,
});

const read = async (db: Db | Tx, userId: string) => {
  const [row] = await db.select().from(profile).where(eq(profile.userId, userId));
  const proof = await db
    .select({ id: profileProof.id, text: profileProof.text })
    .from(profileProof)
    .where(eq(profileProof.userId, userId))
    .orderBy(asc(profileProof.position));
  return { row, proof };
};

export const createDrizzleProfileRepository = (db: Db): ProfileRepository => ({
  get: async (userId) => {
    const { row, proof } = await read(db, userId);
    return row ? toProfile(row, proof) : null;
  },

  save: (userId, fields, options = {}) =>
    db.transaction(async (tx) => {
      const values = {
        ...toColumns(fields),
        ...(options.confirm ? { confirmedAt: new Date() } : {}),
      };
      await tx
        .insert(profile)
        .values({ userId, ...values })
        .onConflictDoUpdate({
          target: profile.userId,
          set: Object.keys(values).length ? values : { userId },
        });
      if (options.proof) {
        await tx.delete(profileProof).where(eq(profileProof.userId, userId));
        if (options.proof.length) {
          await tx.insert(profileProof).values(
            options.proof.map((p, position) => ({
              ...(p.id ? { id: p.id } : {}),
              userId,
              text: p.text,
              position,
            })),
          );
        }
      }
      const { row, proof } = await read(tx, userId);
      const { confirmedAt: _, ...result } = toProfile(row, proof);
      return result;
    }),
});
