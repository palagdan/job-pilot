import type { MappedJob } from '../types.ts';
import { asRec, cleanDescription, countryCode, date, httpUrl, str } from './access.ts';
import { buildJob } from './build.ts';

/** The `jobId` field is a hash; the stable id is the number at the end of the canonical URL. */
const idFromUrl = (url: string | null) => url?.match(/\/(\d{5,})\/?$/)?.[1] ?? null;

export const mapPraceCz = (item: unknown): MappedJob | null => {
  const r = asRec(item);
  const url = httpUrl(r.canonicalUrl) ?? httpUrl(r.sourceUrl);
  return buildJob({
    item,
    externalId: idFromUrl(url) ?? str(r.jobKey),
    url,
    title: str(r.title),
    company: str(r.company),
    locationRaw: str(r.location),
    cityHint: str(r.district),
    country: countryCode(r.sourceCountry),
    description: cleanDescription(r.descriptionText) ?? cleanDescription(r.description),
    workFormats: [],
    salaryRaw: str(r.salaryText) ?? str(r.salaryRange),
    postedAt: date(r.postedAt),
  });
};
