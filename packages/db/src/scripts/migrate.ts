import { runMigrations } from '../migrator.ts';
import { requireEnv } from './env.ts';

const url = process.argv.includes('--test')
  ? requireEnv('TEST_DATABASE_URL')
  : requireEnv('DATABASE_URL');
await runMigrations(url);
console.log(`Migrations applied (${new URL(url).pathname.slice(1)}).`);
