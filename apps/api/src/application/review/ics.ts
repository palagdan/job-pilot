export type IcsEvent = {
  uid: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  url: string;
  description: string | null;
  now: Date;
};

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
const escapeText = (s: string) => s.replace(/[\\;,]/g, (ch) => `\\${ch}`).replace(/\r?\n/g, '\\n');

/** Folds lines longer than 75 octets (continuation lines start with a space). */
const fold = (line: string): string[] => {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = bytes.encode(ch).length;
    if (size + n > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.map((l, i) => (i === 0 ? l : ` ${l}`));
};

/** A single-event calendar file ("Add to calendar"). Without an end time the event lasts one hour. */
export const buildIcs = (e: IcsEvent): string => {
  const end = e.endsAt ?? new Date(e.startsAt.getTime() + 60 * 60 * 1000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JobPilot//Review//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@jobpilot`,
    `DTSTAMP:${stamp(e.now)}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(e.title)}`,
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    `URL:${e.url}`,
    ...(e.description ? [`DESCRIPTION:${escapeText(e.description.slice(0, 1000))}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.flatMap(fold).join('\r\n')}\r\n`;
};
