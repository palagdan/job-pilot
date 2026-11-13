import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { parseEnv } from './env.ts';
import { baseEnv, databaseEnv } from './fragments.ts';

const shape = { ...baseEnv, ...databaseEnv, PORT: z.coerce.number().int().default(3001) };
const url = 'postgres://u:p@localhost:5432/db';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseEnv', () => {
  it('parses valid input and coerces types', () => {
    const env = parseEnv(shape, { DATABASE_URL: url, PORT: '4000', LOG_LEVEL: 'debug' });
    expect(env).toEqual({
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
      DATABASE_URL: url,
      PORT: 4000,
    });
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('applies defaults', () => {
    const env = parseEnv(shape, { DATABASE_URL: url });
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.PORT).toBe(3001);
  });

  it('exits with a message naming the missing variable', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => parseEnv(shape, {})).toThrow('exit');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid environment: DATABASE_URL'),
    );
  });
});
