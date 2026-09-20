import { describe, expect, it } from 'vitest';
import { DEFAULT_RANKING } from '../lib/model';
import { compareScores, nextScoreChange, scorePost } from '../lib/ranking';

describe('weighted ranking', () => {
  it('uses 3:1 weights and permits an old, highly relevant post to score well', () => {
    const now = Date.now();
    expect(scorePost(5, now, DEFAULT_RANKING, now)).toEqual({ relevance: 5, recency: 5, total: 5 });
    expect(scorePost(5, 0, DEFAULT_RANKING, now)).toEqual({ relevance: 5, recency: 1, total: 4 });
  });
  it('decays across the selected window and stays at 1 afterward', () => {
    const start = Date.now();
    const window = DEFAULT_RANKING.freshnessMinutes * 60 * 1000;
    expect(scorePost(4, start, DEFAULT_RANKING, start + window / 4 - 1).recency).toBe(5);
    expect(scorePost(4, start, DEFAULT_RANKING, start + window / 4).recency).toBe(4);
    expect(scorePost(4, start, DEFAULT_RANKING, start + window).recency).toBe(1);
    expect(nextScoreChange(start, DEFAULT_RANKING, start + window)).toBeNull();
  });
  it('sorts by the weighted result before rounding the display score', () => {
    const now = Date.now();
    const fresh = { score: scorePost(4, now, DEFAULT_RANKING, now), createdAt: now };
    const old = { score: scorePost(5, 0, DEFAULT_RANKING, now), createdAt: 0 };
    expect(fresh.score.total).toBe(old.score.total);
    expect(compareScores(fresh, old, DEFAULT_RANKING)).toBeLessThan(0);
  });
});
