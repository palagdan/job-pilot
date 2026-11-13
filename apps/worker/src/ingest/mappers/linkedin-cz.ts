import type { MappedJob } from '../types.ts';
import { asRec, cleanDescription, date, httpUrl, str } from './access.ts';
import { buildJob } from './build.ts';

export const mapLinkedinCz = (item: unknown): MappedJob | null => {
  const r = asRec(item);
  return buildJob({
    item,
    externalId: str(r.id),
    url: httpUrl(r.url),
    title: str(r.title),
    company: str(r.companyName),
    locationRaw: str(r.location),
    description: cleanDescription(r.description) ?? cleanDescription(r.descriptionHtml),
    workFormats: [],
    salaryRaw: str(r.salary),
    postedAt: date(r.postedDate),
  });
};
