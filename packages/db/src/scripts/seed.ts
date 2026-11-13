import { createDb } from '../client.ts';
import { seedDemoUser } from '../seed/demo-user.ts';
import { seedSources } from '../seed/sources.ts';
import { assertLocalDatabase, requireEnv } from './env.ts';

const url = requireEnv('DATABASE_URL');
assertLocalDatabase(url);

const { db, close } = createDb(url, { max: 1 });
try {
  const sources = await seedSources(db);
  const user = await seedDemoUser(db);
  console.log(`Seeded ${sources} sources and demo user ${user.email}.`);
} finally {
  await close();
}
