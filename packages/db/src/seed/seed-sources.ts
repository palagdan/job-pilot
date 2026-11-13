import { createDb } from '../client.ts';
import { seedSources } from './sources.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Invalid environment: DATABASE_URL: Required');
  process.exit(1);
}

const { db, close } = createDb(url, { max: 1 });
const count = await seedSources(db);
await close();
console.log(`Seeded ${count} sources`);
