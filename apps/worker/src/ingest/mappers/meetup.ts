import type { MappedEvent } from '../types.ts';
import { asRec, cleanDescription, countryCode, date, httpUrl, str } from './access.ts';
import { buildEvent } from './build.ts';
import { venueText } from './luma.ts';

export const mapMeetup = (item: unknown): MappedEvent | null => {
  const r = asRec(item);
  const venue = asRec(r.venue);
  const online = r.isOnline === true || r.eventType === 'ONLINE';
  return buildEvent({
    item,
    externalId: str(r.eventId),
    url: httpUrl(r.eventUrl),
    title: str(r.eventName),
    organizer: str(asRec(r.group).name) ?? str(r.organizedByGroup),
    description: cleanDescription(r.eventDescription),
    startsAt: date(r.startDateTime) ?? date(r.date),
    endsAt: date(r.endDateTime),
    venue: online ? null : venueText(str(venue.name), str(venue.address) ?? str(r.address)),
    cityRaw: str(venue.city) ?? str(asRec(r.group).city),
    country: countryCode(venue.country),
    online,
    cancelled: str(r.eventStatus)?.toUpperCase() === 'CANCELLED',
    extraDropKeys: ['organizerName', 'organizerId', 'organizerProfileUrl'],
  });
};
