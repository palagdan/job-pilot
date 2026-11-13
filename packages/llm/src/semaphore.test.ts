import { describe, expect, it } from 'vitest';
import { createSemaphore } from './semaphore.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createSemaphore', () => {
  it('respects capacity and frees units on release', async () => {
    const sem = createSemaphore(2);
    const a = await sem.acquire(1);
    const b = await sem.acquire(1);
    expect(sem.inUse()).toBe(2);
    let got = false;
    const c = sem.acquire(1).then((rel) => {
      got = true;
      return rel;
    });
    await tick();
    expect(got).toBe(false);
    expect(sem.waiting()).toBe(1);
    a();
    const relC = await c;
    expect(sem.inUse()).toBe(2);
    b();
    relC();
    expect(sem.inUse()).toBe(0);
  });

  it('is FIFO: a big request at the head blocks smaller ones behind it', async () => {
    const sem = createSemaphore(4);
    const held = await sem.acquire(3);
    const order: string[] = [];
    const big = sem.acquire(4).then((r) => {
      order.push('big');
      return r;
    });
    const small = sem.acquire(1).then((r) => {
      order.push('small');
      return r;
    });
    await tick();
    expect(order).toEqual([]);
    held();
    (await big)();
    (await small)();
    expect(order).toEqual(['big', 'small']);
  });

  it('clamps units above capacity', async () => {
    const sem = createSemaphore(2);
    const rel = await sem.acquire(10);
    expect(sem.inUse()).toBe(2);
    rel();
    expect(sem.inUse()).toBe(0);
  });

  it('rejects an aborted waiter and removes it from the queue', async () => {
    const sem = createSemaphore(1);
    const held = await sem.acquire(1);
    const controller = new AbortController();
    const waiting = sem.acquire(1, controller.signal);
    controller.abort(new Error('stop'));
    await expect(waiting).rejects.toThrow('stop');
    expect(sem.waiting()).toBe(0);
    held();
    expect(sem.inUse()).toBe(0);
  });

  it('release is idempotent', async () => {
    const sem = createSemaphore(2);
    const rel = await sem.acquire(1);
    await sem.acquire(1);
    rel();
    rel();
    expect(sem.inUse()).toBe(1);
  });
});
