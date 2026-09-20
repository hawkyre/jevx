import type { RankingSettings, Score } from './model';

export interface PostScore { relevance: Score; recency: Score; total: Score }

export function scorePost(relevance: Score, createdAt: number, settings: RankingSettings, now = Date.now()): PostScore {
  const age = Math.max(0, now - createdAt);
  const step = settings.freshnessMinutes * 60 * 1000 / (5 - 1);
  const recency = Math.max(1, 5 - Math.floor(age / step)) as Score;
  const total = Math.round((relevance * settings.relevanceWeight + recency * settings.recencyWeight) /
    (settings.relevanceWeight + settings.recencyWeight)) as Score;
  return { relevance, recency, total };
}

export function nextScoreChange(createdAt: number, settings: RankingSettings, now = Date.now()): number | null {
  const step = settings.freshnessMinutes * 60 * 1000 / (5 - 1);
  const next = Math.floor(Math.max(0, now - createdAt) / step) + 1;
  return next <= 5 - 1 ? createdAt + next * step : null;
}

export function compareScores(a: { score: PostScore; createdAt: number }, b: { score: PostScore; createdAt: number }, settings: RankingSettings): number {
  return (b.score.relevance - a.score.relevance) * settings.relevanceWeight +
    (b.score.recency - a.score.recency) * settings.recencyWeight ||
    b.score.relevance - a.score.relevance || b.createdAt - a.createdAt;
}
