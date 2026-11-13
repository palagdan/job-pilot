import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not read the repo-root .env by itself.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/*.ts',
  out: './migrations',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://jobpilot:jobpilot@localhost:5432/jobpilot',
  },
  strict: true,
  verbose: true,
});
