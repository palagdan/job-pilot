import type { MappedEvent, MappedJob } from '../types.ts';
import { mapEventbrite } from './eventbrite.ts';
import { mapIndeedCz } from './indeed-cz.ts';
import { mapJobsCz } from './jobs-cz.ts';
import { mapLinkedinCz } from './linkedin-cz.ts';
import { mapLuma } from './luma.ts';
import { mapMeetup } from './meetup.ts';
import { mapPraceCz } from './prace-cz.ts';
import { mapProfesiaCz } from './profesia-cz.ts';
import { mapStartupjobsCz } from './startupjobs-cz.ts';

export type Mapper =
  | { kind: 'job'; map: (item: unknown) => MappedJob | null }
  | { kind: 'event'; map: (item: unknown) => MappedEvent | null };

const mappers: Record<string, Mapper> = {
  'jobs-cz': { kind: 'job', map: mapJobsCz },
  'prace-cz': { kind: 'job', map: mapPraceCz },
  'startupjobs-cz': { kind: 'job', map: mapStartupjobsCz },
  'profesia-cz': { kind: 'job', map: mapProfesiaCz },
  'linkedin-cz': { kind: 'job', map: mapLinkedinCz },
  'indeed-cz': { kind: 'job', map: mapIndeedCz },
  'luma-prague': { kind: 'event', map: mapLuma },
  'meetup-prague': { kind: 'event', map: mapMeetup },
  'meetup-brno': { kind: 'event', map: mapMeetup },
  'eventbrite-cz': { kind: 'event', map: mapEventbrite },
};

export const mapperFor = (sourceKey: string): Mapper | null => mappers[sourceKey] ?? null;
