import type { WorkFormat } from '@job-pilot/shared/enums';
import { canonicalUrl, detectLanguage, normalizeCity } from '../normalize.ts';
import { scrubRaw } from '../scrub.ts';
import type { MappedEvent, MappedJob } from '../types.ts';

export type JobInput = {
  item: unknown;
  externalId: string | null;
  url: string | null;
  title: string | null;
  company: string | null;
  locationRaw: string | null;
  /** Used when the location text has no known city. */
  cityHint?: string | null;
  regionHint?: string | null;
  country?: string | null;
  description: string | null;
  workFormats: WorkFormat[];
  salaryRaw: string | null;
  postedAt: Date | null;
  languageHint?: string | null;
};

export const buildJob = (input: JobInput): MappedJob | null => {
  const { url, title, company } = input;
  if (!url || !title || !company) return null;

  const place = normalizeCity(input.locationRaw);
  const cityHint = place.city ? null : normalizeCity(input.cityHint);
  const city = place.city ?? cityHint?.city ?? null;
  const region = place.region ?? cityHint?.region ?? input.regionHint ?? null;
  const country = input.country ?? (place.isCzech || cityHint?.isCzech ? 'CZ' : null);
  const language =
    detectLanguage(`${title}\n${input.description ?? ''}`) ?? input.languageHint ?? null;

  return {
    externalId: input.externalId,
    url,
    canonicalUrl: canonicalUrl(url),
    title,
    company,
    description: input.description,
    locationRaw: input.locationRaw,
    city,
    region,
    country,
    workFormats: input.workFormats,
    language,
    salaryRaw: input.salaryRaw,
    postedAt: input.postedAt,
    raw: scrubRaw(input.item),
  };
};

export type EventInput = {
  item: unknown;
  externalId: string | null;
  url: string | null;
  title: string | null;
  organizer: string | null;
  description: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  venue: string | null;
  cityRaw: string | null;
  country?: string | null;
  online: boolean;
  languageHint?: string | null;
  cancelled?: boolean;
  extraDropKeys?: readonly string[];
};

export const buildEvent = (input: EventInput): MappedEvent | null => {
  const { url, title, startsAt } = input;
  if (!url || !title || !startsAt) return null;

  const place = normalizeCity(input.cityRaw);
  const country = input.country ?? (place.isCzech ? 'CZ' : null);
  const language =
    detectLanguage(`${title}\n${input.description ?? ''}`) ?? input.languageHint ?? null;

  return {
    externalId: input.externalId,
    url,
    title,
    organizer: input.organizer,
    description: input.description,
    startsAt,
    endsAt: input.endsAt,
    venue: input.venue,
    city: place.city,
    country,
    online: input.online,
    language,
    cancelledAt: input.cancelled ? new Date() : null,
    raw: scrubRaw(input.item, input.extraDropKeys),
  };
};
