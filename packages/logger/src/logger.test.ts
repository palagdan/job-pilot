import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.ts';

const capture = () => {
  const lines: Record<string, unknown>[] = [];
  return { lines, destination: { write: (line: string) => void lines.push(JSON.parse(line)) } };
};

describe('createLogger', () => {
  it('writes JSON lines with name, level, message, fields and child bindings', () => {
    const { lines, destination } = capture();
    const log = createLogger({ name: 'api', level: 'info', pretty: false, destination });
    log.child({ requestId: 'r1' }).info('request done', { status: 200 });
    log.debug('hidden below level');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      name: 'api',
      msg: 'request done',
      requestId: 'r1',
      status: 200,
      level: 30,
    });
  });

  it('redacts secrets and serializes errors with stack', () => {
    const { lines, destination } = capture();
    const log = createLogger({ name: 'api', level: 'info', pretty: false, destination });
    log.error('failed', { token: 'abc', headers: { cookie: 'x' }, error: new Error('boom') });
    const line = lines[0] as {
      token: string;
      headers: { cookie: string };
      error: { message: string; stack: string };
    };
    expect(line.token).toBe('[redacted]');
    expect(line.headers.cookie).toBe('[redacted]');
    expect(line.error.message).toBe('boom');
    expect(line.error.stack).toContain('Error: boom');
  });
});
