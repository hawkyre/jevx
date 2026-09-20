export const MAX_POST_AGE_MS = 60 * 60 * 1000;
export const MODEL = 'jev-1.13.0';
export const POLICY_VERSION = '1';

export interface Profile {
  background: string;
  interests: string;
  audience: string;
  exclusions: string;
}

export interface Search {
  id: string;
  query: string;
  selected: boolean;
}

export interface Settings {
  profile: Profile;
  searches: Search[];
  enabled: boolean;
  consent: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  profile: { background: '', interests: '', audience: '', exclusions: '' },
  searches: [],
  enabled: true,
  consent: false,
};

export interface Post {
  id: string;
  author: string;
  text: string;
  quotedText: string;
  createdAt: number;
  kind: 'post' | 'reply' | 'unknown';
  incomplete: boolean;
}

export type Decision = 'highlight' | 'collapse' | 'needs_context';
export interface Assessment {
  decision: Decision;
  reason: string;
}

export type PostResult =
  | { status: 'assessed'; assessment: Assessment }
  | { status: 'excluded'; reason: 'Older than 60 minutes' | 'Reply' }
  | { status: 'visible'; reason: string };

export interface PublicState {
  settings: Settings;
  connected: boolean;
}

export function isFresh(post: Post, now = Date.now()): boolean {
  return Number.isFinite(post.createdAt) && post.createdAt <= now && now - post.createdAt < MAX_POST_AGE_MS;
}

export function profileReady(profile: Profile): boolean {
  return profile.interests.trim().length > 0;
}

export function exclusion(post: Post, now = Date.now()): PostResult | null {
  if (!Number.isFinite(post.createdAt) || post.createdAt > now) {
    return { status: 'visible', reason: 'Could not check the post date' };
  }
  if (!isFresh(post, now)) return { status: 'excluded', reason: 'Older than 60 minutes' };
  if (post.kind === 'reply') return { status: 'excluded', reason: 'Reply' };
  if (post.kind === 'unknown') return { status: 'visible', reason: 'Could not check the post type' };
  return null;
}

export function searchUrl(query: string): string {
  const url = new URL('https://x.com/search');
  url.searchParams.set('q', `(${query.trim()}) -filter:replies`);
  url.searchParams.set('src', 'typed_query');
  url.searchParams.set('f', 'live');
  return url.href;
}

export function isSearchUrl(url: string | undefined, query: string): boolean {
  if (!url) return false;
  try {
    const actual = new URL(url);
    const expected = new URL(searchUrl(query));
    return actual.origin === expected.origin && actual.pathname === '/search' &&
      actual.searchParams.get('q') === expected.searchParams.get('q') && actual.searchParams.get('f') === 'live';
  } catch { return false; }
}

export function isPost(value: unknown): value is Post {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === 'string' && /^\d+$/.test(p.id) &&
    typeof p.author === 'string' && /^[A-Za-z0-9_]+$/.test(p.author) &&
    typeof p.text === 'string' && typeof p.quotedText === 'string' &&
    typeof p.createdAt === 'number' && Number.isFinite(p.createdAt) &&
    ['post', 'reply', 'unknown'].includes(String(p.kind)) && typeof p.incomplete === 'boolean';
}

export function parseSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') throw new Error('Invalid settings');
  const settings = value as Record<string, unknown>;
  const profile = settings.profile as Record<string, unknown> | undefined;
  if (!profile || !['background', 'interests', 'audience', 'exclusions'].every(key => typeof profile[key] === 'string') ||
    !Array.isArray(settings.searches) || typeof settings.enabled !== 'boolean' || typeof settings.consent !== 'boolean') {
    throw new Error('Invalid settings');
  }
  const searches = settings.searches.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid search');
    const search = item as Record<string, unknown>;
    if (typeof search.id !== 'string' || typeof search.query !== 'string' || !search.query.trim() || typeof search.selected !== 'boolean') {
      throw new Error('Invalid search');
    }
    return { id: search.id, query: search.query.trim(), selected: search.selected };
  });
  if (new Set(searches.map(search => search.id)).size !== searches.length) throw new Error('Duplicate search');
  return { profile: profile as unknown as Profile, searches, enabled: settings.enabled, consent: settings.consent };
}
