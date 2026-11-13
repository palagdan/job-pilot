type Waiter = { units: number; grant: () => void; reject: (reason: unknown) => void };

/**
 * Weighted FIFO semaphore. The limit is per process: api and worker each get their own
 * `LLM_CONCURRENCY_UNITS` share of the plan's concurrency budget.
 * A large request at the head of the queue blocks smaller ones behind it, so it cannot starve.
 */
export const createSemaphore = (capacity: number) => {
  let used = 0;
  const queue: Waiter[] = [];

  const drain = () => {
    while (queue[0] && used + queue[0].units <= capacity) {
      const waiter = queue.shift() as Waiter;
      used += waiter.units;
      waiter.grant();
    }
  };

  return {
    /** Resolves with a `release` function once `units` (clamped to capacity) are available. */
    acquire(units: number, signal?: AbortSignal): Promise<() => void> {
      const needed = Math.min(Math.max(units, 1), capacity);
      return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        let released = false;
        const waiter: Waiter = {
          units: needed,
          grant: () => {
            signal?.removeEventListener('abort', onAbort);
            resolve(() => {
              if (released) return;
              released = true;
              used -= needed;
              drain();
            });
          },
          reject,
        };
        const onAbort = () => {
          const index = queue.indexOf(waiter);
          if (index === -1) return;
          queue.splice(index, 1);
          reject(signal?.reason);
          drain();
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        queue.push(waiter);
        drain();
      });
    },
    inUse: () => used,
    waiting: () => queue.length,
  };
};

export type Semaphore = ReturnType<typeof createSemaphore>;
