import { z } from 'zod';
import { dateTimeSchema, idSchema } from './common.ts';
import { runStatuses, runStepKeys, runStepStatuses, runTriggers } from './enums.ts';

export const runStepSchema = z.object({
  key: z.enum(runStepKeys),
  status: z.enum(runStepStatuses),
});

export const agentRunSchema = z.object({
  id: idSchema,
  trigger: z.enum(runTriggers),
  status: z.enum(runStatuses),
  steps: z.array(runStepSchema),
  newCount: z.number().int(),
  startedAt: dateTimeSchema.nullable(),
  finishedAt: dateTimeSchema.nullable(),
  /** "This is taking longer than usual" after 10 minutes. */
  slow: z.boolean(),
});
export type AgentRun = z.infer<typeof agentRunSchema>;

/** Today header / banners: current or last run + next scheduled run. */
export const agentStatusSchema = z.object({
  paused: z.boolean(),
  currentRun: agentRunSchema.nullable(),
  lastRun: agentRunSchema.nullable(),
  nextRunAt: dateTimeSchema.nullable(),
});
export type AgentStatus = z.infer<typeof agentStatusSchema>;
