import type { MappedJob } from '../types.ts';
import {
  asRec,
  cleanDescription,
  countryCode,
  date,
  httpUrl,
  num,
  str,
  workFormatList,
} from './access.ts';
import { buildJob } from './build.ts';

const salaryText = (r: Record<string, unknown>) => {
  const min = num(r.salaryMin);
  const max = num(r.salaryMax);
  if (min === null && max === null) return null;
  const range =
    min !== null && max !== null && min !== max ? `${min} - ${max}` : String(min ?? max);
  const currency = str(r.salaryCurrency);
  const period = str(r.salaryPeriod);
  return [range, currency, period ? `/ ${period}` : null].filter(Boolean).join(' ');
};

export const mapStartupjobsCz = (item: unknown): MappedJob | null => {
  const r = asRec(item);
  return buildJob({
    item,
    externalId: str(r.jobId),
    url: httpUrl(r.url),
    title: str(r.title),
    company: str(r.company),
    locationRaw: str(r.location),
    regionHint: str(r.region),
    country: countryCode(r.country),
    description: cleanDescription(r.description),
    workFormats: workFormatList(
      r.workArrangement,
      r.workModes,
      r.remote === true ? 'remote' : null,
    ),
    salaryRaw: salaryText(r),
    postedAt: date(r.postedAt),
    languageHint: str(r.language),
  });
};
