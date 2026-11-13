import type { Db } from '@job-pilot/db/client';
import { upload } from '@job-pilot/db/schema/cv';
import { profile } from '@job-pilot/db/schema/profile';
import { ownedBy } from '@job-pilot/db/scoping';
import { desc, eq, isNull } from 'drizzle-orm';
import type { CvFactsReader } from '../../application/ports/cv-facts-reader.ts';

const present = (values: (string | null | undefined)[]) =>
  values.filter((v): v is string => Boolean(v?.trim()));

/** Reads the current CV's parsed content (written by the worker) and the profile. */
export const createDrizzleCvFactsReader = (db: Db): CvFactsReader => ({
  forUser: async (userId) => {
    const [cv] = await db
      .select({ content: upload.parsedContent })
      .from(upload)
      .where(ownedBy(upload, userId, eq(upload.kind, 'cv_original'), isNull(upload.replacedAt)))
      .orderBy(desc(upload.createdAt))
      .limit(1);
    const [p] = await db
      .select({ title: profile.currentTitle, location: profile.location, skills: profile.skills })
      .from(profile)
      .where(eq(profile.userId, userId));
    const content = cv?.content;
    return {
      titles: present([
        p?.title,
        content?.header.headline,
        ...(content?.experience.map((e) => e.title) ?? []),
      ]),
      skills: present([...(p?.skills ?? []), ...(content?.skills ?? [])]),
      locations: present([
        p?.location,
        content?.header.location,
        ...(content?.experience.map((e) => e.location) ?? []),
      ]),
    };
  },
});
