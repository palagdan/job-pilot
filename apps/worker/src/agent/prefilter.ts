import type { Db } from '@job-pilot/db/client';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { eventListing, jobPosting } from '@job-pilot/db/schema/sources';
import { and, desc, eq, gt, isNull, lt, or, type SQL, sql } from 'drizzle-orm';
import { normalizeCity } from '../ingest/normalize.ts';

export type PrefilterTargets = {
  roles: string[];
  locations: string[];
  workFormats: string[];
  exclusions: string[];
};

export type PrefilterProfile = { skills: string[] };

export type JobCandidate = {
  id: string;
  title: string;
  company: string;
  city: string | null;
  locationRaw: string | null;
  description: string | null;
  titleMatch: boolean;
  /** Not matched by role keywords; included only so a run always has something to rank. */
  topUp: boolean;
};

export type EventCandidate = {
  id: string;
  title: string;
  organizer: string | null;
  city: string | null;
  online: boolean;
  startsAt: Date;
  description: string | null;
};

const STOP_WORDS = new Set([
  'senior',
  'junior',
  'lead',
  'head',
  'chief',
  'principal',
  'staff',
  'manager',
  'specialist',
  'expert',
  'associate',
  'intern',
  'director',
  'full',
  'and',
  'the',
  'for',
  'of',
  'officer',
  'consultant',
]);

const CZECH: Record<string, string[]> = {
  developer: ['vývojář', 'programátor'],
  engineer: ['inženýr'],
  designer: ['designér'],
  analyst: ['analytik'],
  manager: ['manažer'],
  marketing: ['marketing'],
  sales: ['obchod'],
  accountant: ['účetní'],
  frontend: ['frontend'],
  backend: ['backend'],
};

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .map((w) => w.replace(/^[.]+|[.]+$/g, ''))
    .filter((w) => w.length >= 3);

/** Loose search keywords from target roles (stop words dropped unless nothing else is left) and top skills. */
export const buildKeywords = (roles: string[], skills: string[], maxSkills = 8): string[] => {
  const out = new Set<string>();
  for (const role of roles) {
    const all = words(role);
    const meaningful = all.filter((w) => !STOP_WORDS.has(w));
    for (const w of meaningful.length > 0 ? meaningful : all) {
      out.add(w);
      for (const cs of CZECH[w] ?? []) out.add(cs);
    }
  }
  for (const skill of skills.slice(0, maxSkills)) {
    const s = skill.trim().toLowerCase();
    if (s.length >= 3) out.add(s);
  }
  return [...out];
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

const ilikeAny = (column: SQL, patterns: string[]): SQL => {
  const list = sql.join(
    patterns.map((p) => sql`${`%${escapeLike(p)}%`}`),
    sql`, `,
  );
  return sql`${column} ilike any (array[${list}]::text[])`;
};

const isRemoteLocation = (location: string) => /remote|vzdálen|home\s*office/i.test(location);

/** Cities of the target locations, lowercase, with the normalised Czech name added ("Prague" -> "praha"). */
export const targetCities = (locations: string[]): string[] => {
  const out = new Set<string>();
  for (const location of locations) {
    if (isRemoteLocation(location)) continue;
    out.add(location.trim().toLowerCase());
    const normalized = normalizeCity(location).city;
    if (normalized) out.add(normalized.toLowerCase());
  }
  out.delete('');
  return [...out];
};

const wantsRemote = (targets: PrefilterTargets) =>
  targets.workFormats.includes('remote') || targets.locations.some(isRemoteLocation);

const DAY = 24 * 60 * 60 * 1000;

export type SelectJobsInput = {
  userId: string;
  targets: PrefilterTargets;
  profile: PrefilterProfile;
  limit: number;
  now?: Date;
};

/** Minimum role-matched candidates before unmatched postings in the target location are added. */
export const MIN_ROLE_MATCHES = 5;

export const selectJobCandidates = async (
  db: Db,
  { userId, targets, profile, limit, now = new Date() }: SelectJobsInput,
): Promise<JobCandidate[]> => {
  const keywords = buildKeywords(targets.roles, profile.skills);
  const cities = targetCities(targets.locations);

  const cityMatch = (): SQL | undefined => {
    if (cities.length === 0) return undefined;
    return or(
      sql`lower(${jobPosting.city}) = any (array[${sql.join(
        cities.map((c) => sql`${c}`),
        sql`, `,
      )}]::text[])`,
      ilikeAny(sql`${jobPosting.locationRaw}`, cities),
    );
  };

  const base = (): SQL[] => {
    const conditions: (SQL | undefined)[] = [
      isNull(jobPosting.expiredAt),
      gt(jobPosting.lastSeenAt, new Date(now.getTime() - 21 * DAY)),
      sql`not exists (select 1 from ${opportunity} where ${opportunity.userId} = ${userId} and ${opportunity.jobPostingId} = ${jobPosting.id})`,
    ];
    const exclusions = targets.exclusions.map((e) => e.trim()).filter((e) => e.length >= 3);
    if (exclusions.length > 0) {
      conditions.push(
        sql`not (${ilikeAny(sql`${jobPosting.company}`, exclusions)} or ${ilikeAny(sql`${jobPosting.title}`, exclusions)})`,
      );
    }
    return conditions.filter((c): c is SQL => c !== undefined);
  };

  const locationCondition = (): SQL | undefined => {
    const parts: SQL[] = [];
    const city = cityMatch();
    if (city) parts.push(city);
    parts.push(isNull(jobPosting.city));
    if (wantsRemote(targets)) parts.push(sql`'remote' = any (${jobPosting.workFormats})`);
    // No location target at all: do not filter by place.
    if (!city && !wantsRemote(targets)) return undefined;
    return or(...parts);
  };

  const titleMatchExpr: SQL<boolean> =
    keywords.length > 0
      ? sql<boolean>`(${ilikeAny(sql`${jobPosting.title}`, keywords)})`
      : sql<boolean>`false`;

  const columns = {
    id: jobPosting.id,
    title: jobPosting.title,
    company: jobPosting.company,
    city: jobPosting.city,
    locationRaw: jobPosting.locationRaw,
    description: jobPosting.description,
    titleMatch: titleMatchExpr,
  };

  const matched: JobCandidate[] =
    keywords.length === 0
      ? []
      : (
          await db
            .select(columns)
            .from(jobPosting)
            .where(
              and(
                ...base(),
                locationCondition(),
                or(
                  ilikeAny(sql`${jobPosting.title}`, keywords),
                  ilikeAny(sql`${jobPosting.description}`, keywords),
                ),
              ),
            )
            .orderBy(desc(titleMatchExpr), desc(jobPosting.firstSeenAt))
            .limit(limit)
        ).map((r) => ({ ...r, titleMatch: Boolean(r.titleMatch), topUp: false }));

  const need = Math.min(limit, MIN_ROLE_MATCHES) - matched.length;
  if (need <= 0) return matched;

  const taken = matched.map((m) => m.id);
  const city = cityMatch();
  const topUp = await db
    .select(columns)
    .from(jobPosting)
    .where(
      and(
        ...base(),
        // Only postings that are positively in the target location (or remote), not unknown ones.
        city
          ? wantsRemote(targets)
            ? or(city, sql`'remote' = any (${jobPosting.workFormats})`)
            : city
          : undefined,
        taken.length > 0
          ? sql`${jobPosting.id} <> all (array[${sql.join(
              taken.map((t) => sql`${t}`),
              sql`, `,
            )}]::uuid[])`
          : undefined,
      ),
    )
    .orderBy(desc(jobPosting.firstSeenAt))
    .limit(need);
  return [...matched, ...topUp.map((r) => ({ ...r, titleMatch: false, topUp: true }))];
};

export type SelectEventsInput = {
  userId: string;
  targets: PrefilterTargets;
  limit?: number;
  now?: Date;
};

export const selectEventCandidates = async (
  db: Db,
  { userId, targets, limit = 10, now = new Date() }: SelectEventsInput,
): Promise<EventCandidate[]> => {
  const cities = targetCities(targets.locations);
  const where = [
    gt(eventListing.startsAt, now),
    lt(eventListing.startsAt, new Date(now.getTime() + 45 * DAY)),
    isNull(eventListing.cancelledAt),
    sql`not exists (select 1 from ${opportunity} where ${opportunity.userId} = ${userId} and ${opportunity.eventListingId} = ${eventListing.id})`,
  ];
  const place =
    cities.length > 0
      ? or(
          eq(eventListing.online, true),
          sql`lower(${eventListing.city}) = any (array[${sql.join(
            cities.map((c) => sql`${c}`),
            sql`, `,
          )}]::text[])`,
        )
      : undefined;
  return db
    .select({
      id: eventListing.id,
      title: eventListing.title,
      organizer: eventListing.organizer,
      city: eventListing.city,
      online: eventListing.online,
      startsAt: eventListing.startsAt,
      description: eventListing.description,
    })
    .from(eventListing)
    .where(and(...where, place))
    .orderBy(eventListing.startsAt)
    .limit(limit);
};
