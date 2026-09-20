export const DEFAULT_CONCURRENCY = 20;

export function parseConcurrency(value: unknown): number {
  if (value === undefined) return DEFAULT_CONCURRENCY;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Concurrent requests must be a positive whole number');
  return value;
}

export function createRequestPool(initialLimit = DEFAULT_CONCURRENCY) {
  let limit = parseConcurrency(initialLimit);
  let active = 0;
  const waiting: (() => void)[] = [];
  function drain() { while (active < limit && waiting.length) waiting.shift()!(); }
  return {
    setLimit(value: number) { limit = parseConcurrency(value); drain(); },
    run<T>(work: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        waiting.push(() => {
          active++;
          void Promise.resolve().then(work).then(resolve, reject).finally(() => { active--; drain(); });
        });
        drain();
      });
    },
  };
}
