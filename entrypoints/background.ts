import { browser } from 'wxt/browser';
import { assess } from '../lib/jev';
import { createCredentials } from '../lib/credentials';
import {
  DEFAULT_SETTINGS, MAX_POST_AGE_MS, MODEL, POLICY_VERSION, exclusion, isPost,
  isSearchUrl, parseSettings, profileReady, searchUrl,
  type Assessment, type Post, type PostResult, type PublicState, type Settings,
} from '../lib/model';

interface CacheEntry { expires: number; assessment: Assessment }
interface Override { expires: number; show: boolean }

export default defineBackground(() => {
  const credentials = createCredentials(browser.storage.session);
  let revision = 0;
  let controller = new AbortController();
  let blocked: string | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let opening: Promise<unknown> = Promise.resolve();
  let mutations: Promise<unknown> = Promise.resolve();
  const pending = new Map<string, Promise<PostResult>>();

  async function settings(): Promise<Settings> {
    const stored = await browser.storage.local.get('settings');
    return stored.settings ? parseSettings(stored.settings) : structuredClone(DEFAULT_SETTINGS);
  }

  async function state(): Promise<PublicState> {
    const [config, key] = await Promise.all([settings(), credentials.get()]);
    return { settings: config, connected: Boolean(key) };
  }

  async function broadcast() {
    const tabs = await browser.tabs.query({ url: 'https://x.com/*' });
    await Promise.allSettled([
      browser.runtime.sendMessage({ type: 'changed' }),
      ...tabs.flatMap(tab => tab.id === undefined ? [] : [browser.tabs.sendMessage(tab.id, { type: 'changed' })]),
    ]);
  }

  function invalidate() {
    revision++;
    controller.abort();
    controller = new AbortController();
    pending.clear();
    blocked = null;
  }

  async function digest(value: unknown): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
    return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
  }

  async function prune() {
    const entries = await browser.storage.session.get(null);
    const expired = Object.entries(entries).filter(([key, value]) =>
      (key.startsWith('cache:') || key.startsWith('override:')) &&
      (value as CacheEntry).expires <= Date.now()).map(([key]) => key);
    if (expired.length) await browser.storage.session.remove(expired);
  }

  async function check(post: Post): Promise<PostResult> {
    const requestedRevision = revision;
    const signal = controller.signal;
    const config = await settings();
    if (!config.enabled) return { status: 'visible', reason: 'Filtering paused' };
    const excluded = exclusion(post);
    if (excluded) return excluded;
    if (!config.consent || !profileReady(config.profile)) return { status: 'visible', reason: 'Set up your profile in jevx' };
    const session = await browser.storage.session.get(`override:${post.id}`);
    const override = session[`override:${post.id}`] as Override | undefined;
    if (override && override.expires > Date.now()) {
      return { status: 'assessed', assessment: { decision: override.show ? 'needs_context' : 'collapse', reason: 'Your choice' } };
    }
    const key = await credentials.get();
    if (!key) return { status: 'visible', reason: 'Connect TypeSafe in settings' };
    const cacheKey = `cache:${await digest([MODEL, POLICY_VERSION, config.profile, post])}`;
    const cached = (await browser.storage.session.get(cacheKey))[cacheKey] as CacheEntry | undefined;
    if (requestedRevision !== revision) return { status: 'visible', reason: 'Settings changed' };
    if (cached && cached.expires > Date.now()) return { status: 'assessed', assessment: cached.assessment };
    if (blocked) return { status: 'visible', reason: blocked };
    const existing = pending.get(cacheKey);
    if (existing) return existing;
    const job = queue.then(async (): Promise<PostResult> => {
      if (requestedRevision !== revision) return { status: 'visible', reason: 'Settings changed' };
      const expired = exclusion(post);
      if (expired) return expired;
      if (blocked) return { status: 'visible', reason: blocked };
      try {
        const assessment = await assess(config.profile, post, key, signal);
        if (requestedRevision !== revision) return { status: 'visible', reason: 'Settings changed' };
        const expiredAfterRequest = exclusion(post);
        if (expiredAfterRequest) return expiredAfterRequest;
        await prune();
        await browser.storage.session.set({ [cacheKey]: { expires: post.createdAt + MAX_POST_AGE_MS, assessment } });
        return { status: 'assessed', assessment };
      } catch (error) {
        if (signal.aborted) return { status: 'visible', reason: 'Settings changed' };
        blocked = error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'TypeError'
          ? error.message : 'Could not check. Pause, then resume to retry';
        return { status: 'visible', reason: blocked };
      }
    });
    pending.set(cacheKey, job);
    queue = job.catch(() => undefined);
    void job.finally(() => { if (pending.get(cacheKey) === job) pending.delete(cacheKey); }).catch(() => undefined);
    return job;
  }

  async function openSearches(queries: string[]): Promise<number> {
    const unique = [...new Set(queries.map(query => query.trim()).filter(Boolean))];
    const session = await browser.storage.session.get('managedTabs');
    const managed = (session.managedTabs ?? {}) as Record<string, number>;
    let first = true;
    for (const query of unique) {
      let id = managed[query];
      let reusable = false;
      if (id !== undefined) {
        try { reusable = isSearchUrl((await browser.tabs.get(id)).url, query); } catch { reusable = false; }
      }
      if (!reusable) {
        id = (await browser.tabs.create({ url: searchUrl(query), active: first })).id;
        if (id !== undefined) managed[query] = id;
      } else if (first && id !== undefined) {
        await browser.tabs.update(id, { active: true });
      }
      first = false;
    }
    await browser.storage.session.set({ managedTabs: managed });
    return unique.length;
  }

  function open(queries: string[]) {
    const result = opening.then(() => openSearches(queries));
    opening = result.catch(() => undefined);
    return result;
  }

  async function handle(raw: unknown, sender: { id?: string; url?: string; tab?: unknown; frameId?: number }): Promise<unknown> {
    if (sender.id !== browser.runtime.id || !sender.url) throw new Error('Unknown sender');
    const extensionPage = [browser.runtime.getURL('/popup.html'), browser.runtime.getURL('/options.html')]
      .some(url => sender.url?.split('?')[0] === url);
    const fromX = new URL(sender.url).origin === 'https://x.com' && sender.frameId === 0;
    if (!extensionPage && !fromX) throw new Error('Unknown sender');
    if (!raw || typeof raw !== 'object') throw new Error('Invalid request');
    const message = raw as Record<string, unknown>;
    if (message.type === 'state') return state();
    if (message.type === 'options') {
      await browser.runtime.openOptionsPage();
      return null;
    }
    if (message.type === 'assess' && fromX && isPost(message.post)) return check(message.post);
    if (message.type === 'toggle' && typeof message.enabled === 'boolean') {
      const config = await settings();
      invalidate();
      await browser.storage.local.set({ settings: { ...config, enabled: message.enabled } });
      await broadcast();
      return state();
    }
    if (message.type === 'override' && fromX && isPost(message.post) && typeof message.show === 'boolean') {
      await browser.storage.session.set({ [`override:${message.post.id}`]: { expires: message.post.createdAt + MAX_POST_AGE_MS, show: message.show } });
      await broadcast();
      return null;
    }
    if (message.type === 'explore' && fromX && typeof message.query === 'string' && message.query.trim()) {
      return open([message.query]);
    }
    if (!extensionPage) throw new Error('Open extension settings for this action');
    if (message.type === 'settings') {
      const config = parseSettings(message.settings);
      invalidate();
      await browser.storage.local.set({ settings: config });
      await broadcast();
      return state();
    }
    if (message.type === 'connect' && typeof message.key === 'string' && message.key.trim()) {
      invalidate();
      await credentials.save(message.key.trim());
      await broadcast();
      return state();
    }
    if (message.type === 'disconnect') {
      invalidate();
      await credentials.remove();
      await broadcast();
      return state();
    }
    if (message.type === 'open') {
      const config = await settings();
      return open(config.searches.filter(search => search.selected).map(search => search.query));
    }
    throw new Error('Invalid request');
  }

  browser.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if ((message as { type?: string } | null)?.type === 'changed') return false;
    const type = (message as { type?: string } | null)?.type;
    const mutates = ['settings', 'toggle', 'connect', 'disconnect', 'override'].includes(type ?? '');
    const result = mutates ? mutations.then(() => handle(message, sender)) : handle(message, sender);
    if (mutates) mutations = result.catch(() => undefined);
    void result.then(value => respond({ ok: true, value }))
      .catch(error => respond({ ok: false, error: error instanceof Error ? error.message : 'Request failed' }));
    return true;
  });
});
