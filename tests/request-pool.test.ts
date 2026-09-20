import { describe, expect, it, vi } from 'vitest';
import { createRequestPool, DEFAULT_CONCURRENCY, parseConcurrency } from '../lib/request-pool';

describe('shared request pool', () => {
  it('starts twenty jobs, holds the next, and releases a slot after a failure', async () => {
    const pool = createRequestPool();
    const complete: (() => void)[] = [];
    let fail!: (error: Error) => void;
    const work = vi.fn(() => new Promise<void>((resolve, reject) => { complete.push(resolve); fail ??= reject; }));
    const jobs = Array.from({ length: DEFAULT_CONCURRENCY + 1 }, () => pool.run(work));
    const settled = Promise.allSettled(jobs);
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(20));
    fail(new Error('Request failed'));
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(21));
    complete.forEach(done => done());
    expect((await settled).filter(result => result.status === 'rejected')).toHaveLength(1);
  });
  it('respects a lower limit while existing jobs finish and can raise it again', async () => {
    const pool = createRequestPool(2);
    const complete: (() => void)[] = [];
    const work = vi.fn(() => new Promise<void>(resolve => { complete.push(resolve); }));
    const jobs = Array.from({ length: 4 }, () => pool.run(work));
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(2));
    pool.setLimit(1); complete[0]!();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(work).toHaveBeenCalledTimes(2);
    complete[1]!();
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(3));
    pool.setLimit(2);
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(4));
    complete.forEach(done => done()); await Promise.all(jobs);
  });
  it('migrates old settings and rejects invalid limits', () => {
    expect(parseConcurrency(undefined)).toBe(20);
    for (const value of [0, -1, 1.5, NaN, Infinity, '20']) expect(() => parseConcurrency(value)).toThrow();
  });
});
