import { z } from 'zod';

/**
 * Validates `source` against `shape` once at startup. On failure prints one line per issue
 * and exits with code 1, so a misconfigured process never half-starts.
 */
export const parseEnv = <Shape extends z.ZodRawShape>(
  shape: Shape,
  source: Record<string, string | undefined> = process.env,
): Readonly<z.infer<z.ZodObject<Shape>>> => {
  const result = z.object(shape).safeParse(source);
  if (!result.success) {
    for (const issue of result.error.issues) {
      console.error(`Invalid environment: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    process.exit(1);
  }
  return Object.freeze(result.data);
};
