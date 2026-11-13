import type { MappedEvent } from '../types.ts';
import { asRec, cleanDescription, countryCode, date, httpUrl, str } from './access.ts';
import { buildEvent } from './build.ts';
import { venueText } from './luma.ts';

export const mapEventbrite = (item: unknown): MappedEvent | null => {
  const r = asRec(item);
  return buildEvent({
    item,
    externalId: str(r.eventId),
    url: httpUrl(r.eventUrl) ?? httpUrl(r.url),
    title: str(r.name),
    organizer: str(r.organizerName),
    description: cleanDescription(r.description),
    startsAt: date(r.startDate),
    endsAt: date(r.endDate),
    venue: r.isOnline === true ? null : venueText(str(r.venueName), str(r.streetAddress)),
    cityRaw: str(r.addressLocality),
    country: countryCode(r.country),
    online: r.isOnline === true,
    languageHint: str(r.language)?.slice(0, 2).toLowerCase() ?? null,
    cancelled: /cancel/i.test(str(r.status) ?? ''),
  });
};
