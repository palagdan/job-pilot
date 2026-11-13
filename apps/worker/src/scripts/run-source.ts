import { createDb } from '@job-pilot/db/client';
import { source } from '@job-pilot/db/schema/sources';
import { createJobQueue } from '@job-pilot/jobs/client';
import { eq } from 'drizzle-orm';
import { env } from '../env.ts';

const key = process.argv[2];
if (!key) {
  console.error('Usage: pnpm source:run <source-key>');
  process.exit(1);
}

const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
const queue = createJobQueue({ connectionString: env.DATABASE_URL });

try {
  const [row] = await db.select({ id: source.id }).from(source).where(eq(source.key, key));
  if (!row) throw new Error(`No source with key "${key}"`);
  await queue.start();
  const jobId = await queue.send('source.run', { sourceId: row.id });
  console.log(`enqueued source.run for ${key}: job ${jobId}`);
} finally {
  await queue.stop({ graceful: true });
  await close();
}
