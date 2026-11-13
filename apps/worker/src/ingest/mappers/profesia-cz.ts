import type { MappedJob } from '../types.ts';
import {
  asRec,
  cleanDescription,
  countryCode,
  date,
  httpUrl,
  str,
  workFormatList,
} from './access.ts';
import { buildJob } from './build.ts';

export const mapProfesiaCz = (item: unknown): MappedJob | null => {
  const r = asRec(item);
  const country = countryCode(r.country);
  if (country !== 'CZ') return null;
  return buildJob({
    item,
    externalId: str(r.jobId),
    url: httpUrl(r.url),
    title: str(r.title),
    company: str(r.company),
    locationRaw: str(r.location),
    regionHint: str(r.region),
    country,
    description: cleanDescription(r.description),
    workFormats: workFormatList(r.workArrangement, r.remote === true ? 'remote' : null),
    salaryRaw: str(r.salaryText),
    postedAt: date(r.postedAt),
    languageHint: str(r.language),
  });
};
