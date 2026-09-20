import { afterEach, describe, expect, it, vi } from 'vitest';
import { startFeed, type FeedApi } from '../lib/feed';
import { DEFAULT_FRESHNESS_MINUTES, type PostResult } from '../lib/model';
import { article, post, readyState } from './fixtures';

let stop: (() => void) | undefined;
afterEach(() => { stop?.(); document.body.replaceChildren(); vi.useRealTimers(); });

function setup(check = vi.fn<FeedApi['check']>().mockResolvedValue({ status: 'assessed', assessment: { decision: 'collapse', reason: 'Outside your interests', relevance: 1 } })) {
  document.documentElement.lang = 'en';
  document.body.innerHTML = '<main data-testid="primaryColumn"></main>';
  const state = readyState();
  const api: FeedApi = { state: vi.fn().mockImplementation(async () => state), check, toggle: vi.fn(), override: vi.fn().mockResolvedValue(null), explore: vi.fn().mockResolvedValue(null), options: vi.fn().mockResolvedValue(null) };
  let currentUrl = 'https://x.com/home';
  const feed = startFeed(api, document, () => currentUrl);
  stop = feed.dispose;
  return { feed, api, state, main: document.querySelector('main')!, navigate: (url: string) => { currentUrl = url; feed.navigate(); } };
}

describe('feed behavior', () => {
  it.each(['/notifications', '/notifications/verified', '/notifications/mentions?filter=all'])('does not filter %s, even after settings or override updates', async path => {
    const { main, api, feed, navigate } = setup();
    navigate(`https://x.com${path}`);
    const element = article(post()); main.append(element);
    await feed.refresh();
    feed.applyOverride('123456789', false);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(main.querySelector('[data-jevx-ui]')).toBeNull();
    expect(element.dataset.jevxState).toBeUndefined();
    expect(api.check).not.toHaveBeenCalled();
    navigate('https://x.com/home');
    await vi.waitFor(() => expect(element.dataset.jevxState).toBe('collapsed'));
  });
  it('removes filtering on entry to Notifications and ignores a pending assessment', async () => {
    let resolve!: (value: PostResult) => void;
    const check = vi.fn<FeedApi['check']>().mockImplementationOnce(() => new Promise(done => { resolve = done; }))
      .mockResolvedValue({ status: 'assessed', assessment: { decision: 'collapse', reason: 'Outside your interests', relevance: 1 } });
    const { main, navigate } = setup(check);
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    navigate('https://x.com/notifications');
    resolve({ status: 'assessed', assessment: { decision: 'collapse', reason: 'Outside your interests', relevance: 1 } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(main.querySelector('[data-jevx-ui]')).toBeNull();
    expect(element.dataset.jevxState).toBeUndefined();
    main.append(article(post({ id: '222' })));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(check).toHaveBeenCalledTimes(1);
    navigate('https://x.com/home');
    await vi.waitFor(() => expect(element.dataset.jevxState).toBe('collapsed'));
  });
  it('restores collapsed posts and removes the toolbar and ranking on Notifications', async () => {
    const { main, navigate } = setup();
    const element = article(post()); main.append(element);
    const originalLabel = element.getAttribute('aria-labelledby');
    await vi.waitFor(() => expect(element.dataset.jevxState).toBe('collapsed'));
    [...main.querySelectorAll<HTMLButtonElement>('[data-jevx-ui="toolbar"] button')].find(button => button.textContent === 'Top matches')!.click();
    expect(main.querySelector('[data-jevx-ui="ranking"]')).not.toBeNull();
    navigate('https://x.com/notifications/mentions');
    await vi.waitFor(() => expect(main.querySelector('[data-jevx-ui]')).toBeNull());
    expect(element.dataset.jevxState).toBeUndefined();
    expect(element.getAttribute('aria-labelledby')).toBe(originalLabel);
  });
  it('provides score details and post actions in Top matches without nesting controls in a link', async () => {
    const { main, api, feed } = setup(vi.fn<FeedApi['check']>().mockResolvedValue({
      status: 'assessed', assessment: { decision: 'highlight', reason: 'Matches your interests', relevance: 5 },
    }));
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.dataset.jevxState).toBe('highlight'));
    [...main.querySelectorAll<HTMLButtonElement>('[data-jevx-ui="toolbar"] button')].find(button => button.textContent === 'Top matches')!.click();
    const ranking = main.querySelector<HTMLElement>('[data-jevx-ui="ranking"]')!;
    expect(ranking.querySelector('[data-jevx-score]')?.textContent).toBe('5/5');
    expect(ranking.querySelector('a button')).toBeNull();
    const openPanel = (label: string) => {
      const panel = ranking.querySelector<HTMLElement>(`[role="dialog"][aria-label="${label}"]`)!;
      Object.defineProperty(panel, 'hidePopover', { value: vi.fn() });
      const event = new Event('beforetoggle');
      Object.defineProperty(event, 'newState', { value: 'open' });
      panel.dispatchEvent(event);
      return panel;
    };
    expect(openPanel('Post score').textContent).toContain('Matches your interests');
    const actions = openPanel('Post actions');
    actions.querySelector<HTMLButtonElement>('button')!.click();
    expect(api.explore).toHaveBeenCalledWith('from:builder');
    actions.querySelector<HTMLButtonElement>('.jevx-hide-action')!.click();
    expect(api.override).toHaveBeenCalledWith(expect.objectContaining({ id: '123456789' }), false);
    feed.applyOverride('123456789', false);
    await vi.waitFor(() => expect(element.dataset.jevxState).toBe('collapsed'));
    expect(main.querySelector('[data-jevx-ui="ranking"] a')).toBeNull();
    expect(api.check).toHaveBeenCalledTimes(1);
  });
  it('preserves the assessment when opening a post from Home', async () => {
    const { main, navigate, api } = setup(vi.fn<FeedApi['check']>().mockResolvedValue({
      status: 'assessed', assessment: { decision: 'highlight', reason: 'Matches your interests', relevance: 5 },
    }));
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.dataset.jevxState).toBe('highlight'));
    const controls = element.querySelector('[data-jevx-ui="post"]');
    navigate('https://x.com/builder/status/123456789');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(element.querySelector('[data-jevx-ui="post"]')).toBe(controls);
    expect(element.dataset.jevxState).toBe('highlight');
    expect(api.check).toHaveBeenCalledTimes(1);
  });
  it('updates only the selected post and keeps other controls and assessments', async () => {
    const { main, feed, api } = setup();
    const selected = article(post());
    const other = article(post({ id: '222' }));
    main.append(selected, other);
    await vi.waitFor(() => expect(other.dataset.jevxState).toBe('collapsed'));
    const controls = other.querySelector('[data-jevx-ui="post"]');
    const toolbar = main.querySelector('[data-jevx-ui="toolbar"]');
    feed.applyOverride('123456789', true);
    await vi.waitFor(() => expect(selected.querySelector('[data-jevx-ui]')?.textContent).toBe('Collapse'));
    feed.applyOverride('123456789', false);
    await vi.waitFor(() => expect(selected.dataset.jevxState).toBe('collapsed'));
    expect(other.querySelector('[data-jevx-ui="post"]')).toBe(controls);
    expect(main.querySelector('[data-jevx-ui="toolbar"]')).toBe(toolbar);
    expect(api.state).toHaveBeenCalledTimes(1);
    expect(api.check).toHaveBeenCalledTimes(2);
  });
  it.each([true, false])('preserves override %s when an earlier assessment finishes', async show => {
    let resolve!: (value: PostResult) => void;
    const check = vi.fn<FeedApi['check']>().mockImplementation(() => new Promise(done => { resolve = done; }));
    const { main, feed } = setup(check);
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    feed.applyOverride('123456789', show);
    resolve({ status: 'assessed', assessment: { decision: 'highlight', reason: 'Matches your interests', relevance: 5 } });
    await vi.waitFor(() => expect(element.querySelector('[data-jevx-ui]')?.textContent).toBe(show ? 'Collapse' : 'Filtered postShow'));
    expect(element.dataset.jevxState).toBe(show ? undefined : 'collapsed');
    expect(check).toHaveBeenCalledTimes(1);
  });
  it('defers a remote override until the composer closes', async () => {
    const { main, feed, navigate, api } = setup();
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.dataset.jevxState).toBe('collapsed'));
    const controls = element.querySelector('[data-jevx-ui="post"]');
    navigate('https://x.com/compose/post');
    feed.applyOverride('123456789', true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(element.querySelector('[data-jevx-ui="post"]')).toBe(controls);
    expect(element.dataset.jevxState).toBe('collapsed');
    navigate('https://x.com/home');
    await vi.waitFor(() => expect(element.querySelector('[data-jevx-ui]')?.textContent).toBe('Collapse'));
    expect(api.check).toHaveBeenCalledTimes(1);
  });
  it('preserves feed controls, ranking, and assessments across composer navigation', async () => {
    const { main, api, navigate } = setup(vi.fn<FeedApi['check']>().mockResolvedValue({ status: 'assessed', assessment: {
      decision: 'highlight', reason: 'Matches your interests', relevance: 5,
    } }));
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.dataset.jevxState).toBe('highlight'));
    [...main.querySelectorAll<HTMLButtonElement>('[data-jevx-ui="toolbar"] button')].find(button => button.textContent === 'Top matches')!.click();
    const controls = element.querySelector('[data-jevx-ui="post"]');
    const toolbar = main.querySelector('[data-jevx-ui="toolbar"]');
    const ranking = main.querySelector('[data-jevx-ui="ranking"]');
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<div data-testid="tweetTextarea_0" contenteditable="true"></div>';
    dialog.append(article(post({ id: '222' })));
    navigate('https://x.com/compose/post'); document.body.append(dialog);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(dialog.querySelector('[data-jevx-ui]')).toBeNull();
    expect(element.querySelector('[data-jevx-ui="post"]')).toBe(controls);
    dialog.remove(); navigate('https://x.com/home');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(element.querySelector('[data-jevx-ui="post"]')).toBe(controls);
    expect(main.querySelector('[data-jevx-ui="toolbar"]')).toBe(toolbar);
    expect(main.querySelector('[data-jevx-ui="ranking"]')).toBe(ranking);
    expect(api.state).toHaveBeenCalledTimes(1);
    expect(api.check).toHaveBeenCalledTimes(1);
  });
  it('defers an in-flight assessment while a composer dialog is open', async () => {
    let resolve!: (value: PostResult) => void;
    const check = vi.fn<FeedApi['check']>().mockImplementation(() => new Promise(done => { resolve = done; }));
    const { main, navigate } = setup(check);
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    const controls = element.querySelector('[data-jevx-ui="post"]');
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<div data-testid="tweetTextarea_0" contenteditable="true"></div>';
    document.body.append(dialog);
    resolve({ status: 'assessed', assessment: { decision: 'collapse', reason: 'Outside your interests', relevance: 1 } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(element.dataset.jevxState).toBeUndefined();
    expect(element.querySelector('[data-jevx-ui="post"]')).toBe(controls);
    dialog.remove(); navigate('https://x.com/home');
    await vi.waitFor(() => expect(element.dataset.jevxState).toBe('collapsed'));
    expect(check).toHaveBeenCalledTimes(1);
  });
  it('applies changed settings after closing the composer', async () => {
    const { main, feed, state, navigate } = setup();
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.dataset.jevxState).toBe('collapsed'));
    const controls = element.querySelector('[data-jevx-ui="post"]');
    navigate('https://x.com/compose/post');
    state.settings.enabled = false;
    await feed.refresh();
    expect(element.querySelector('[data-jevx-ui="post"]')).toBe(controls);
    navigate('https://x.com/home');
    await vi.waitFor(() => expect(element.querySelector('[data-jevx-ui="post"]')).toBeNull());
    expect(element.dataset.jevxState).toBeUndefined();
  });
  it('reconciles post type on real navigation without reloading settings', async () => {
    const { main, navigate, api } = setup(vi.fn<FeedApi['check']>().mockResolvedValue({ status: 'assessed', assessment: {
      decision: 'highlight', reason: 'Matches your interests', relevance: 5,
    } }));
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.dataset.jevxState).toBe('highlight'));
    navigate('https://x.com/other/status/555');
    await vi.waitFor(() => expect(element.dataset.jevxState).toBe('collapsed'));
    expect(element.querySelector('[data-jevx-ui]')?.textContent).toContain('Reply');
    expect(api.state).toHaveBeenCalledTimes(1);
  });
  it('filters newly loaded Home posts without opening searches', async () => {
    const { main, api } = setup();
    const first = article(post()); main.append(first);
    await vi.waitFor(() => expect(first.matches('[data-jevx-state="collapsed"]')).toBe(true));
    const next = article(post({ id: '222' })); main.append(next);
    await vi.waitFor(() => expect(next.matches('[data-jevx-state="collapsed"]')).toBe(true));
    expect(api.check).toHaveBeenCalledTimes(2);
    expect(api.explore).not.toHaveBeenCalled();
    const settings = [...main.querySelectorAll<HTMLButtonElement>('[data-jevx-ui="toolbar"] button')].find(button => button.textContent === 'Settings');
    settings!.click();
    expect(api.options).toHaveBeenCalledTimes(1);
  });
  it('keeps filtering after Home replaces its timeline', async () => {
    const { main, api } = setup();
    const first = article(post()); main.append(first);
    await vi.waitFor(() => expect(first.matches('[data-jevx-state="collapsed"]')).toBe(true));
    const following = article(post({ id: '333' }));
    main.replaceChildren(following);
    await vi.waitFor(() => expect(following.matches('[data-jevx-state="collapsed"]')).toBe(true));
    expect(main.querySelectorAll('[data-jevx-ui="toolbar"]')).toHaveLength(1);
    expect(api.check).toHaveBeenCalledTimes(2);
  });
  it('collapses irrelevant posts, lets the reader reveal them, and restores on pause', async () => {
    const { main, feed, state, api } = setup();
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.matches('[data-jevx-state="collapsed"]')).toBe(true));
    expect(element.getAttribute('aria-label')).toBe('Filtered post');
    element.querySelector<HTMLButtonElement>('[data-jevx-ui] button')!.click();
    expect(element.matches('[data-jevx-state="collapsed"]')).toBe(false);
    expect(api.override).toHaveBeenCalledWith(expect.objectContaining({ id: '123456789' }), true);
    state.settings.enabled = false;
    await feed.refresh();
    expect(element.querySelector('[data-jevx-ui]')).toBeNull();
    expect(element.getAttribute('aria-labelledby')).toContain('author-');
  });
  it('excludes replies but assesses older posts', async () => {
    const { main, api } = setup();
    const reply = article(post(), true);
    const old = article(post({ id: '456', createdAt: Date.now() - DEFAULT_FRESHNESS_MINUTES * 60 * 1000 }));
    main.append(reply, old);
    await vi.waitFor(() => expect(old.matches('[data-jevx-state="collapsed"]')).toBe(true));
    expect(reply.matches('[data-jevx-state="collapsed"]')).toBe(true);
    expect(api.check).toHaveBeenCalledTimes(1);
    expect(api.check).toHaveBeenCalledWith(expect.objectContaining({ id: '456' }));
  });
  it('never applies a delayed assessment to a recycled post element', async () => {
    let resolve!: (value: PostResult) => void;
    const check = vi.fn<FeedApi['check']>().mockImplementationOnce(() => new Promise(done => { resolve = done; }))
      .mockResolvedValue({ status: 'assessed', assessment: { decision: 'highlight', reason: 'Matches your interests', relevance: 5 } });
    const { main } = setup(check);
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    element.innerHTML = article(post({ id: '999', text: 'A different post' })).innerHTML;
    resolve({ status: 'assessed', assessment: { decision: 'collapse', reason: 'Outside your interests', relevance: 1 } });
    await vi.waitFor(() => expect(element.matches('[data-jevx-state="highlight"]')).toBe(true));
    expect(element.matches('[data-jevx-state="collapsed"]')).toBe(false);
  });
  it('leaves failures visible', async () => {
    const { main } = setup(vi.fn<FeedApi['check']>().mockRejectedValue(new Error('Offline')));
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.textContent).toContain('Could not check'));
    expect(element.matches('[data-jevx-state="collapsed"]')).toBe(false);
  });
  it('collapses missing-context posts but respects an explicit Show choice', async () => {
    const check = vi.fn<FeedApi['check']>().mockResolvedValue({ status: 'assessed', assessment: {
      decision: 'needs_context', reason: 'More context needed', relevance: null,
    } });
    const { main, feed, api } = setup(check);
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.matches('[data-jevx-state="collapsed"]')).toBe(true));
    expect(element.querySelector('[data-jevx-ui]')?.textContent).toContain('More context needed');
    element.querySelector<HTMLButtonElement>('[data-jevx-ui] button')!.click();
    expect(api.override).toHaveBeenCalledWith(expect.objectContaining({ id: '123456789' }), true);
    feed.applyOverride('123456789', true);
    await vi.waitFor(() => expect(element.querySelector('[data-jevx-ui]')?.textContent).toBe('Collapse'));
    expect(element.matches('[data-jevx-state="collapsed"]')).toBe(false);
  });
  it('shows the reload instruction for disconnected extension scripts', async () => {
    const { main } = setup(vi.fn<FeedApi['check']>().mockRejectedValue(new Error('Extension updated. Reload this X tab.')));
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.textContent).toContain('Reload this X tab'));
    expect(element.matches('[data-jevx-state="collapsed"]')).toBe(false);
  });
  it('lowers recency without collapsing a highlighted post', async () => {
    vi.useFakeTimers();
    const { main } = setup(vi.fn<FeedApi['check']>().mockResolvedValue({ status: 'assessed', assessment: { decision: 'highlight', reason: 'Matches your interests', relevance: 5 } }));
    const firstStep = DEFAULT_FRESHNESS_MINUTES * 60 * 1000 / 4;
    const element = article(post({ createdAt: Date.now() - firstStep + 100 })); main.append(element);
    await vi.advanceTimersByTimeAsync(0);
    expect(element.matches('[data-jevx-state="highlight"]')).toBe(true);
    expect(element.querySelector('[data-jevx-score]')?.getAttribute('title')).toContain('Recency 5/5');
    await vi.advanceTimersByTimeAsync(100);
    expect(element.matches('[data-jevx-state="highlight"]')).toBe(true);
    expect(element.querySelector('[data-jevx-score]')?.getAttribute('title')).toContain('Recency 4/5');
  });
  it('retains collapse styling when X replaces its own CSS classes', async () => {
    const { main } = setup();
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.matches('[data-jevx-state="collapsed"]')).toBe(true));
    element.className = 'new-x-render-classes';
    expect(element.matches('[data-jevx-state="collapsed"]')).toBe(true);
    expect(element.querySelector('[data-jevx-ui]')?.textContent).toContain('Filtered post');
  });
  it('ranks older relevant posts without moving X’s post elements', async () => {
    const { main } = setup(vi.fn<FeedApi['check']>().mockImplementation(async value => ({ status: 'assessed', assessment: {
      decision: 'highlight', reason: 'Matches your interests', relevance: value.id === '111' ? 3 : 5,
    } })));
    const fresh = article(post({ id: '111' }));
    const old = article(post({ id: '222', createdAt: Date.now() - DEFAULT_FRESHNESS_MINUTES * 60 * 1000 * 4 }));
    main.append(fresh, old);
    await vi.waitFor(() => expect(old.matches('[data-jevx-state="highlight"]')).toBe(true));
    [...main.querySelectorAll<HTMLButtonElement>('[data-jevx-ui="toolbar"] button')].find(button => button.textContent === 'Top matches')!.click();
    expect([...main.querySelectorAll('[data-jevx-ui="ranking"] a')].map(link => link.getAttribute('href')))
      .toEqual(['https://x.com/builder/status/222', 'https://x.com/builder/status/111']);
    expect([...main.querySelectorAll('article')]).toEqual([fresh, old]);
  });
});
