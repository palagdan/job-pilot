import { z } from 'zod';
import { dateTimeSchema } from './common.ts';
import { llmTasks, opportunityTypes, sourceRunStatuses } from './enums.ts';

/** Ops view (admins only): ingestion health, agent runs and LLM usage over the last `windowDays`. */
const tokens = {
  calls: z.number().int(),
  failed: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
};

export const opsSchema = z.object({
  windowDays: z.number().int(),
  generatedAt: dateTimeSchema,
  sources: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      kind: z.enum(opportunityTypes),
      enabled: z.boolean(),
      runs: z.number().int(),
      failedRuns: z.number().int(),
      itemsFound: z.number().int(),
      itemsIngested: z.number().int(),
      costUsd: z.number(),
      lastRunAt: dateTimeSchema.nullable(),
      lastStatus: z.enum(sourceRunStatuses).nullable(),
      lastError: z.string().nullable(),
    }),
  ),
  inventory: z.object({ activeJobs: z.number().int(), upcomingEvents: z.number().int() }),
  agentRuns: z.object({
    total: z.number().int(),
    failed: z.number().int(),
    active: z.number().int(),
  }),
  llm: z.object({
    totals: z.object(tokens),
    byTask: z.array(z.object({ task: z.enum(llmTasks), ...tokens })),
    byUser: z.array(z.object({ email: z.string(), ...tokens })),
  }),
});
export type Ops = z.infer<typeof opsSchema>;
