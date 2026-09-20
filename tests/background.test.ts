import { beforeEach, describe, expect, it, vi } from 'vitest';
import { post, readyState } from './fixtures';

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
    runtime: { id: 'jevx-test', getURL: (path: string) => `chrome-extension://jevx-test${path}`, sendMessage: vi.fn(async () => undefined), onMessage: { addListener: (callback: Listener) => { listener = callback; } } },
    storage: { local: storage(local), session: storage(session) },
    tabs: {
      query: vi.fn(async () => []), sendMessage: vi.fn(async () => undefined),
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
const response = () => new Response(JSON.stringify({ answers: { visibility: { type: 'choice', choice: 'highlight' } } }), { status: 200 });

beforeEach(() => {
  for (const key of Object.keys(mocks.local)) delete mocks.local[key];
  for (const key of Object.keys(mocks.session)) delete mocks.session[key];
  mocks.tabs.clear(); vi.clearAllMocks();
  mocks.local.settings = readyState().settings;
  mocks.session.key = 'test-only-key';
  vi.stubGlobal('fetch', vi.fn(async () => response()));
  background();
});

describe('background security and session state', () => {
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
