import { afterEach, describe, expect, it, vi } from 'vitest';
import { startFeed, type FeedApi } from '../lib/feed';
import { MAX_POST_AGE_MS, type PostResult } from '../lib/model';
import { article, post, readyState } from './fixtures';

let stop: (() => void) | undefined;
afterEach(() => { stop?.(); document.body.replaceChildren(); vi.useRealTimers(); });

function setup(check = vi.fn<FeedApi['check']>().mockResolvedValue({ status: 'assessed', assessment: { decision: 'collapse', reason: 'Outside your interests' } })) {
  document.documentElement.lang = 'en';
  document.body.innerHTML = '<main data-testid="primaryColumn"></main>';
  const state = readyState();
  const api: FeedApi = { state: vi.fn().mockImplementation(async () => state), check, toggle: vi.fn(), override: vi.fn().mockResolvedValue(null), explore: vi.fn(), options: vi.fn().mockResolvedValue(null) };
  const feed = startFeed(api, document, () => 'https://x.com/home');
  stop = feed.dispose;
  return { feed, api, state, main: document.querySelector('main')! };
}

describe('feed behavior', () => {
  it('filters newly loaded Home posts without opening searches', async () => {
    const { main, api } = setup();
    const first = article(post()); main.append(first);
    await vi.waitFor(() => expect(first.classList.contains('jevx-collapsed')).toBe(true));
    const next = article(post({ id: '222' })); main.append(next);
    await vi.waitFor(() => expect(next.classList.contains('jevx-collapsed')).toBe(true));
    expect(api.check).toHaveBeenCalledTimes(2);
    expect(api.explore).not.toHaveBeenCalled();
    const settings = [...main.querySelectorAll<HTMLButtonElement>('[data-jevx-ui="toolbar"] button')].find(button => button.textContent === 'Settings');
    settings!.click();
    expect(api.options).toHaveBeenCalledTimes(1);
  });
  it('keeps filtering after Home replaces its timeline', async () => {
    const { main, api } = setup();
    const first = article(post()); main.append(first);
    await vi.waitFor(() => expect(first.classList.contains('jevx-collapsed')).toBe(true));
    const following = article(post({ id: '333' }));
    main.replaceChildren(following);
    await vi.waitFor(() => expect(following.classList.contains('jevx-collapsed')).toBe(true));
    expect(main.querySelectorAll('[data-jevx-ui="toolbar"]')).toHaveLength(1);
    expect(api.check).toHaveBeenCalledTimes(2);
  });
  it('collapses irrelevant posts, lets the reader reveal them, and restores on pause', async () => {
    const { main, feed, state, api } = setup();
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.classList.contains('jevx-collapsed')).toBe(true));
    expect(element.getAttribute('aria-label')).toBe('Filtered post');
    element.querySelector<HTMLButtonElement>('[data-jevx-ui] button')!.click();
    expect(element.classList.contains('jevx-collapsed')).toBe(false);
    expect(api.override).toHaveBeenCalledWith(expect.objectContaining({ id: '123456789' }), true);
    state.settings.enabled = false;
    await feed.refresh();
    expect(element.querySelector('[data-jevx-ui]')).toBeNull();
    expect(element.getAttribute('aria-labelledby')).toContain('author-');
  });
  it('does not send replies or expired posts to Jev', async () => {
    const { main, api } = setup();
    const reply = article(post(), true);
    const old = article(post({ id: '456', createdAt: Date.now() - MAX_POST_AGE_MS }));
    main.append(reply, old);
    await vi.waitFor(() => expect(old.classList.contains('jevx-collapsed')).toBe(true));
    expect(reply.classList.contains('jevx-collapsed')).toBe(true);
    expect(api.check).not.toHaveBeenCalled();
  });
  it('never applies a delayed assessment to a recycled post element', async () => {
    let resolve!: (value: PostResult) => void;
    const check = vi.fn<FeedApi['check']>().mockImplementationOnce(() => new Promise(done => { resolve = done; }))
      .mockResolvedValue({ status: 'assessed', assessment: { decision: 'highlight', reason: 'Matches your interests' } });
    const { main } = setup(check);
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    element.innerHTML = article(post({ id: '999', text: 'A different post' })).innerHTML;
    resolve({ status: 'assessed', assessment: { decision: 'collapse', reason: 'Outside your interests' } });
    await vi.waitFor(() => expect(element.classList.contains('jevx-highlight')).toBe(true));
    expect(element.classList.contains('jevx-collapsed')).toBe(false);
  });
  it('leaves failures visible', async () => {
    const { main } = setup(vi.fn<FeedApi['check']>().mockRejectedValue(new Error('Offline')));
    const element = article(post()); main.append(element);
    await vi.waitFor(() => expect(element.textContent).toContain('Could not check'));
    expect(element.classList.contains('jevx-collapsed')).toBe(false);
  });
  it('expires a highlighted post while the page remains open', async () => {
    vi.useFakeTimers();
    const { main } = setup(vi.fn<FeedApi['check']>().mockResolvedValue({ status: 'assessed', assessment: { decision: 'highlight', reason: 'Matches your interests' } }));
    const element = article(post({ createdAt: Date.now() - MAX_POST_AGE_MS + 100 })); main.append(element);
    await vi.advanceTimersByTimeAsync(0);
    expect(element.classList.contains('jevx-highlight')).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(element.classList.contains('jevx-collapsed')).toBe(true);
  });
});
