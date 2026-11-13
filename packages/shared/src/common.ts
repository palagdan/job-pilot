import { z } from 'zod';
import { limits, messages } from './limits.ts';

export const idSchema = z.uuid();
/** ISO 8601 date-time string on the wire. */
export const dateTimeSchema = z.iso.datetime({ offset: true });
/** "YYYY-MM" (CV dates). */
export const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const tagSchema = z
  .string()
  .trim()
  .min(limits.tag.min, messages.tagLength)
  .max(limits.tag.max, messages.tagLength);

/** Tag list: trims, drops case-insensitive duplicates ("duplicates are ignored"), enforces min/max count. */
export const tagListSchema = (
  bounds: { min: number; max: number },
  what: string,
  minMessage?: string,
) =>
  z
    .array(tagSchema)
    .transform((tags) => {
      const seen = new Set<string>();
      return tags.filter((t) => {
        const key = t.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .pipe(
      z
        .array(z.string())
        .min(bounds.min, minMessage ?? `Add at least ${bounds.min} ${what}.`)
        .max(bounds.max, messages.tagLimit(bounds.max, what)),
    );

export const cursorPageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

/** Response of actions that can be undone from a toast. */
export const undoableSchema = z.object({
  /** Pass to the matching undo endpoint within `limits.undoWindowMs`. */
  undoToken: z.string(),
});

export const okSchema = z.object({ ok: z.literal(true) });
