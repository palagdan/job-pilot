import type { MappedJob } from '../types.ts';
import { asRec, cleanDescription, countryCode, date, httpUrl, num, str } from './access.ts';
import { buildJob } from './build.ts';

const salaryText = (value: unknown) => {
  const s = asRec(value);
  const min = num(s.min);
  const max = num(s.max);
  if (min === null && max === null) return null;
  const range =
    min !== null && max !== null && min !== max ? `${min} - ${max}` : String(min ?? max);
  const unit = str(s.unitOfWork);
  return [range, str(s.currencyCode), unit ? `/ ${unit}` : null].filter(Boolean).join(' ');
};

export const mapIndeedCz = (item: unknown): MappedJob | null => {
  const r = asRec(item);
  const location = asRec(r.location);
  const description = asRec(r.description);
  return buildJob({
    item,
    externalId: str(r.key),
    url: httpUrl(r.url),
    title: str(r.title),
    company: str(asRec(r.employer).name),
    locationRaw: str(location.city),
    country: countryCode(location.countryCode),
    description: cleanDescription(description.text) ?? cleanDescription(description.html),
    workFormats: [],
    salaryRaw: salaryText(r.baseSalary),
    postedAt: date(r.datePublished),
    languageHint: str(r.language),
  });
};
