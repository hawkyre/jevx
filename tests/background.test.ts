import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { post, readyState } from './fixtures';
import { defaultDraftSettings } from '../lib/draft-model';

const mocks = vi.hoisted(() => {
  type Sender = { id: string; url: string; frameId: number };
  type Listener = (message: unknown, sender: Sender, respond: (value: unknown) => void) => unknown;
  let listener: Listener;
  const local: Record<string, unknown> = {};
  const session: Record<string, unknown> = {};
  const storage = (data: Record<string, unknown>) => ({
    get: vi.fn(async (keys: string | string[] | null) => keys === null ? structuredClone(data) : Object.fromEntries((typeof keys === 'string' ? [keys] : keys).map(key => [key, structuredClone(data[key])]))),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)); }),
    remove: vi.fn(async (keys: string | string[]) => { for (const key of typeof keys === 'string' ? [keys] : keys) delete data[key]; }),
  });
  const tabs = new Map<number, { id: number; url: string }>();
  const browser = {
    runtime: { id: 'jevx-test', getURL: (path: string) => `chrome-extension://jevx-test${path}`, openOptionsPage: vi.fn(async () => undefined), sendMessage: vi.fn(async () => undefined), onMessage: { addListener: (callback: Listener) => { listener = callback; } } },
    storage: { local: storage(local), session: storage(session) },
    tabs: {
      query: vi.fn(async () => [...tabs.values()]), sendMessage: vi.fn(async (_id: number, _message: unknown) => undefined),
      get: vi.fn(async (id: number) => { if (!tabs.has(id)) throw new Error('Closed'); return tabs.get(id); }),
      create: vi.fn(async ({ url }: { url: string }) => { const tab = { id: tabs.size + 1, url }; tabs.set(tab.id, tab); return tab; }),
      update: vi.fn(async () => undefined),
    },
  };
  return { browser, local, session, tabs, call: (message: unknown, sender: Sender) => new Promise<{ ok: boolean; value?: unknown; error?: string }>(resolve => listener(message, sender, value => resolve(value as { ok: boolean; value?: unknown; error?: string }))) };
});

vi.mock('wxt/browser', () => ({ browser: mocks.browser }));
vi.stubGlobal('defineBackground', (main: () => void) => main);
const background = (await import('../entrypoints/background')).default as unknown as () => void;
const extension = { id: 'jevx-test', url: 'chrome-extension://jevx-test/options.html', frameId: 0 };
const x = { id: 'jevx-test', url: 'https://x.com/home', frameId: 0 };
const response = () => new Response(JSON.stringify({ answers: { visibility: { type: 'choice', choice: 'highlight' }, relevance: { type: 'choice', choice: '5' } } }), { status: 200 });

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  for (const key of Object.keys(mocks.local)) delete mocks.local[key];
  for (const key of Object.keys(mocks.session)) delete mocks.session[key];
  mocks.tabs.clear(); vi.clearAllMocks();
  mocks.local.settings = readyState().settings;
  mocks.session.key = 'test-only-key';
  vi.stubGlobal('fetch', vi.fn(async () => response()));
  background();
});

describe('background security and session state', () => {
  it('requires separate draft consent and prevents X from granting it', async () => {
    const draft = { text: 'Private draft', kind: 'post', parentText: '', contextMissing: false, hasMedia: false, profileId: 'conversation' };
    expect((await mocks.call({ type: 'assess-draft', draft }, x)).ok).toBe(false);
    const settings = defaultDraftSettings(); settings.consent = true;
    expect((await mocks.call({ type: 'draft-settings', settings }, x)).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect((await mocks.call({ type: 'draft-settings', settings }, extension)).ok).toBe(true);
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ answers: Object.fromEntries(Object.keys(body.questions).map(id => [id, { type: 'choice', choice: '4' }])) }));
    });
    expect((await mocks.call({ type: 'assess-draft', draft }, x)).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await mocks.call({ type: 'assess-draft', draft }, { ...x, url: 'https://x.com/notifications' })).ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.session)).not.toContain('Private draft');
  });
  it('syncs a post override without broadcasting a settings reset or calling Jev', async () => {
    mocks.tabs.set(1, { id: 1, url: 'https://x.com/home' });
    mocks.tabs.set(2, { id: 2, url: 'https://x.com/search?q=tools' });
    const value = post();
    for (const show of [false, true]) {
      expect((await mocks.call({ type: 'override', post: value, show }, x)).ok).toBe(true);
      for (const id of [1, 2]) expect(mocks.browser.tabs.sendMessage).toHaveBeenCalledWith(id, {
        type: 'post-override', postId: value.id, show,
      });
      expect((await mocks.call({ type: 'assess', post: value }, x)).value).toMatchObject({
        status: 'assessed', assessment: { decision: show ? 'needs_context' : 'collapse', reason: 'Your choice' },
      });
    }
    expect(mocks.browser.tabs.sendMessage).toHaveBeenCalledTimes(4);
    expect(mocks.browser.runtime.sendMessage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('opens settings from Home without granting settings writes to X', async () => {
    expect((await mocks.call({ type: 'options' }, x)).ok).toBe(true);
    expect(mocks.browser.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
    expect((await mocks.call({ type: 'connect', key: 'bad' }, x)).ok).toBe(false);
  });
  it('keeps the saved key after session storage and the background restart', async () => {
    const connected = await mocks.call({ type: 'connect', key: '  persistent-test-key  ' }, extension);
    expect(connected.value).toMatchObject({ connected: true });
    for (const key of Object.keys(mocks.session)) delete mocks.session[key];
    background();
    const state = await mocks.call({ type: 'state' }, x);
    expect(state.value).toMatchObject({ connected: true });
    expect(JSON.stringify(state)).not.toContain('persistent-test-key');
    expect(JSON.stringify(mocks.local)).not.toContain('persistent-test-key');
    await mocks.call({ type: 'assess', post: post() }, x);
    expect(fetch).toHaveBeenCalledWith('https://api.typesafe.ai/v1/systemone', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer persistent-test-key' }),
    }));
  });
  it('transfers a session key to persistent storage without exposing it', async () => {
    await mocks.call({ type: 'state' }, x);
    expect(mocks.session.key).toBeUndefined();
    background();
    expect((await mocks.call({ type: 'state' }, x)).value).toMatchObject({ connected: true });
    await mocks.call({ type: 'assess', post: post() }, x);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-only-key' }),
    }));
  });
  it('removes both saved and session keys on disconnect', async () => {
    await mocks.call({ type: 'connect', key: 'saved-test-key' }, extension);
    mocks.session.key = 'stale-test-key';
    const disconnected = await mocks.call({ type: 'disconnect' }, extension);
    expect(disconnected.value).toMatchObject({ connected: false });
    expect(mocks.session.key).toBeUndefined();
    background();
    expect((await mocks.call({ type: 'state' }, x)).value).toMatchObject({ connected: false });
    await mocks.call({ type: 'assess', post: post() }, x);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not replace a saved key with a stale session key', async () => {
    await mocks.call({ type: 'connect', key: 'saved-test-key' }, extension);
    mocks.session.key = 'stale-test-key';
    background();
    await mocks.call({ type: 'assess', post: post() }, x);
    expect(mocks.session.key).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer saved-test-key' }),
    }));
  });
  it('never includes the key in the public state', async () => {
    const result = await mocks.call({ type: 'state' }, x);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('test-only-key');
    expect(result.value).toMatchObject({ connected: true });
  });
  it('rejects settings and credential writes from X and other origins', async () => {
    expect((await mocks.call({ type: 'connect', key: 'bad' }, x)).ok).toBe(false);
    expect((await mocks.call({ type: 'settings', settings: readyState().settings }, x)).ok).toBe(false);
    expect((await mocks.call({ type: 'state' }, { ...x, url: 'https://x.com.evil.example/' })).ok).toBe(false);
    expect((await mocks.call({ type: 'state' }, { ...x, frameId: 1 })).ok).toBe(false);
  });
  it('requires consent and a profile before making a paid request', async () => {
    mocks.local.settings = { ...readyState().settings, consent: false };
    const result = await mocks.call({ type: 'assess', post: post() }, x);
    expect(result.value).toMatchObject({ status: 'visible' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent assessments across tabs', async () => {
    const value = post();
    const results = await Promise.all([mocks.call({ type: 'assess', post: value }, x), mocks.call({ type: 'assess', post: value }, x)]);
    expect(results.every(result => result.ok)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    await mocks.call({ type: 'assess', post: value }, x);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('assesses quote-only text and caches assessments of old posts', async () => {
    const value = post({ text: '', quotedText: 'How do you help learners retain vocabulary?', createdAt: 0 });
    const result = await mocks.call({ type: 'assess', post: value }, x);
    expect(result.value).toMatchObject({ status: 'assessed', assessment: { relevance: 5 } });
    const request = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string);
    expect(request.state.post.quotedText).toBe(value.quotedText);
    await mocks.call({ type: 'assess', post: value }, x);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not request an assessment when neither body nor quote has text', async () => {
    const result = await mocks.call({ type: 'assess', post: post({ text: '', quotedText: '' }) }, x);
    expect(result.value).toEqual({ status: 'visible', reason: 'No text to assess' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reuses relevance after ranking weights change', async () => {
    const value = post();
    await mocks.call({ type: 'assess', post: value }, x);
    const settings = readyState().settings;
    settings.ranking = { ...settings.ranking, relevanceWeight: 1, recencyWeight: 3 };
    await mocks.call({ type: 'settings', settings }, extension);
    await mocks.call({ type: 'assess', post: value }, x);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('distinguishes HTTP service errors from missing post context', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 503 }));
    const result = await mocks.call({ type: 'assess', post: post({ quotedText: 'A quote' }) }, x);
    expect(result.value).toMatchObject({ status: 'visible', reason: expect.stringContaining('HTTP 503') });
  });
  it('identifies request timeouts', async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException('Timeout', 'TimeoutError'));
    const result = await mocks.call({ type: 'assess', post: post() }, x);
    expect(result.value).toMatchObject({ status: 'visible', reason: expect.stringContaining('timed out') });
  });
  it('reassesses after a profile edit', async () => {
    const value = post();
    await mocks.call({ type: 'assess', post: value }, x);
    const settings = readyState().settings; settings.profile.interests = 'Gardening';
    await mocks.call({ type: 'settings', settings }, extension);
    await mocks.call({ type: 'assess', post: value }, x);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('opens selected searches once and preserves tabs that the user navigated away from', async () => {
    const settings = readyState().settings;
    settings.searches = [{ id: 'a', query: '#edtech', selected: true }, { id: 'b', query: 'rust', selected: false }];
    mocks.local.settings = settings;
    await Promise.all([mocks.call({ type: 'open' }, extension), mocks.call({ type: 'open' }, extension)]);
    expect(mocks.browser.tabs.create).toHaveBeenCalledTimes(1);
    mocks.tabs.set(1, { id: 1, url: 'https://x.com/home' });
    await mocks.call({ type: 'open' }, extension);
    expect(mocks.browser.tabs.create).toHaveBeenCalledTimes(2);
    expect(mocks.tabs.get(1)?.url).toBe('https://x.com/home');
  });
  it('stops further requests after a service failure until resume', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 429 }));
    await mocks.call({ type: 'assess', post: post() }, x);
    await mocks.call({ type: 'assess', post: post({ id: '222' }) }, x);
    expect(fetch).toHaveBeenCalledTimes(1);
    await mocks.call({ type: 'toggle', enabled: true }, x);
    await mocks.call({ type: 'assess', post: post({ id: '333' }) }, x);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
