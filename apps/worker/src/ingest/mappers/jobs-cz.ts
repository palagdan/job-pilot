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

export const mapJobsCz = (item: unknown): MappedJob | null => {
  const r = asRec(item);
  return buildJob({
    item,
    externalId: str(r.jobId),
    url: httpUrl(r.jobUrl),
    title: str(r.title),
    company: str(r.companyName),
    locationRaw: str(r.location),
    country: countryCode(r.country),
    description: cleanDescription(r.descriptionText) ?? cleanDescription(r.description),
    workFormats: workFormatList(r.remote === true ? 'remote' : null),
    salaryRaw: str(r.salaryRaw) ?? str(asRec(r.salary).raw),
    postedAt: date(r.postedDate),
  });
};
