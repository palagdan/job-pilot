import type { Db } from '@job-pilot/db/client';
import { llmUsage } from '@job-pilot/db/schema/agent';
import type { UsageRecord } from './client.ts';

export const createDbUsageRecorder = (db: Db) => async (u: UsageRecord) => {
  await db.insert(llmUsage).values({
    task: u.task,
    model: u.model,
    promptVersion: u.promptVersion ?? null,
    userId: u.userId ?? null,
    agentRunId: u.agentRunId ?? null,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    durationMs: u.durationMs,
    succeeded: u.succeeded,
  });
};
