import type { MappedEvent } from '../types.ts';
import { asRec, cleanDescription, date, httpUrl, str } from './access.ts';
import { buildEvent } from './build.ts';

export const venueText = (name: string | null, address: string | null) => {
  if (name && address) return address.includes(name) ? address : `${name}, ${address}`;
  return name ?? address;
};

export const mapLuma = (item: unknown): MappedEvent | null => {
  const r = asRec(item);
  const location = asRec(r.location);
  const online = location.isVirtual === true || r.eventType === 'online';
  return buildEvent({
    item,
    externalId: str(r.eventId),
    url: httpUrl(r.eventUrl),
    title: str(r.name),
    organizer: str(asRec(r.organizer).name),
    description: cleanDescription(r.description),
    startsAt: date(r.startAt),
    endsAt: date(r.endAt),
    venue: online ? null : venueText(str(location.name), str(location.address)),
    cityRaw: str(location.city),
    country: /^czech(ia| republic)$/i.test(str(location.country) ?? '') ? 'CZ' : null,
    online,
    languageHint: str(r.locale),
  });
};
