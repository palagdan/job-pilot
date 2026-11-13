import { z } from 'zod';
import { dateTimeSchema, idSchema } from './common.ts';
import { parseStatuses } from './enums.ts';

/**
 * CV upload is `multipart/form-data` with one field `file` (PDF/DOCX, ≤ 5 MB) — not JSON.
 * The api sniffs the real type; see `limits.cvUpload`.
 */
export const uploadSchema = z.object({
  id: idSchema,
  filename: z.string(),
  sizeBytes: z.number().int(),
  pageCount: z.number().int().nullable(),
  parseStatus: z.enum(parseStatuses),
  /** User-facing reason when `parseStatus` is `failed` (E04 copy). */
  parseError: z.string().nullable(),
  createdAt: dateTimeSchema,
});
export type Upload = z.infer<typeof uploadSchema>;
