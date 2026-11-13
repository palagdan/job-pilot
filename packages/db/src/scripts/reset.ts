import postgres from 'postgres';
import { runMigrations } from '../migrator.ts';
import { assertLocalDatabase, requireEnv } from './env.ts';

/** Drops everything in the local dev database and re-applies migrations. Run `db:seed` after. */
const url = requireEnv('DATABASE_URL');
assertLocalDatabase(url);

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await sql.unsafe(
    'drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;',
  );
} finally {
  await sql.end();
}
await runMigrations(url);
console.log('Database reset and migrated.');
