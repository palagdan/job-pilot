import type { RunStepKey, RunStepStatus } from '@job-pilot/shared/enums';
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, timestamptz } from '../columns.ts';
import { user } from './auth.ts';
import { llmTaskEnum, runStatusEnum, runTriggerEnum } from './enums.ts';

export const agentRun = pgTable(
  'agent_run',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    trigger: runTriggerEnum().notNull(),
    status: runStatusEnum().notNull().default('queued'),
    steps: jsonb().$type<{ key: RunStepKey; status: RunStepStatus }[]>().notNull().default([]),
    candidatesCount: integer().notNull().default(0),
    newCount: integer().notNull().default(0),
    startedAt: timestamptz(),
    finishedAt: timestamptz(),
    error: text(),
    ...timestamps(),
  },
  (t) => [
    index().on(t.userId, t.createdAt),
    /** One active run per user. */
    uniqueIndex('agent_run_one_active_per_user')
      .on(t.userId)
      .where(sql`${t.status} in ('queued', 'running')`),
  ],
);

/** Token log per call (Featherless is a flat subscription — tokens are the cost proxy). */
export const llmUsage = pgTable(
  'llm_usage',
  {
    id: id(),
    userId: uuid().references(() => user.id, { onDelete: 'set null' }),
    agentRunId: uuid().references(() => agentRun.id, { onDelete: 'set null' }),
    task: llmTaskEnum().notNull(),
    model: text().notNull(),
    promptVersion: text(),
    inputTokens: integer().notNull(),
    outputTokens: integer().notNull(),
    durationMs: integer().notNull(),
    succeeded: boolean().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.agentRunId)],
);
