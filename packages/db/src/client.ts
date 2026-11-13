import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as activity from './schema/activity.ts';
import * as agent from './schema/agent.ts';
import * as auth from './schema/auth.ts';
import * as chat from './schema/chat.ts';
import * as cv from './schema/cv.ts';
import * as enums from './schema/enums.ts';
import * as notifications from './schema/notifications.ts';
import * as opportunities from './schema/opportunities.ts';
import * as pipeline from './schema/pipeline.ts';
import * as profile from './schema/profile.ts';
import * as sources from './schema/sources.ts';

export const schema = {
  ...enums,
  ...auth,
  ...profile,
  ...cv,
  ...sources,
  ...agent,
  ...opportunities,
  ...pipeline,
  ...activity,
  ...chat,
  ...notifications,
};

export const createDb = (url: string, options: { max?: number } = {}) => {
  const sql = postgres(url, { max: options.max ?? 10 });
  const db = drizzle(sql, { schema, casing: 'snake_case' });
  return { db, close: () => sql.end() };
};

export type Db = ReturnType<typeof createDb>['db'];
