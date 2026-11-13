import { createDb } from '@job-pilot/db/client';
import { agentRun } from '@job-pilot/db/schema/agent';
import { user } from '@job-pilot/db/schema/auth';
import { createJobQueue } from '@job-pilot/jobs/client';
import { eq } from 'drizzle-orm';
import { env } from '../env.ts';

const email = process.argv[2];
if (!email) {
  console.error('Usage: pnpm agent:run <user-email>');
  process.exit(1);
}

const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
const queue = createJobQueue({ connectionString: env.DATABASE_URL });

const isUniqueViolation = (error: unknown): boolean => {
  const code = (e: unknown) => (e as { code?: string } | null)?.code;
  return code(error) === '23505' || code((error as { cause?: unknown } | null)?.cause) === '23505';
};

try {
  const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!owner) throw new Error(`No user with email "${email}"`);
  try {
    const [run] = await db
      .insert(agentRun)
      .values({ userId: owner.id, trigger: 'manual', status: 'queued' })
      .returning({ id: agentRun.id });
    if (!run) throw new Error('Could not create the run');
    await queue.start();
    await queue.send('agent.run', { runId: run.id });
    console.log(`enqueued agent.run: ${run.id}`);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    console.log('agent is busy');
    process.exitCode = 1;
  }
} finally {
  await queue.stop({ graceful: true });
  await close();
}
