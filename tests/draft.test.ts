import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultDraftSettings, draftAverage, parseDraftSettings, type DraftInput, type DraftResult } from '../lib/draft-model';
import { createDraftScorer, parseDraftResult } from '../lib/draft-jev';
import { startDraftScoring, readDraft, type DraftApi } from '../lib/draft-composer';
import { readyState } from './fixtures';
import { mountDraftSettings } from '../lib/draft-settings-ui';

const draft = (): DraftInput => ({ text: 'Here is a concrete example.', kind: 'post', parentText: '', contextMissing: false, hasMedia: false, profileId: 'conversation' });
let stop: (() => void) | undefined;
afterEach(() => { stop?.(); stop = undefined; document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('draft scores', () => {
  it('keeps preset axes independent', () => {
    const settings = defaultDraftSettings();
    settings.profiles[0]!.axes[0]!.criterion = 'Changed';
    expect(settings.profiles[1]!.axes[0]!.criterion).not.toBe('Changed');
  });
  it('saves further axis edits after a first settings save', async () => {
    let settings = defaultDraftSettings();
    const root = document.createElement('main'); document.body.append(root);
    await mountDraftSettings(root, {
      state: async () => ({ settings, connected: true }),
      save: async next => { settings = structuredClone(next); return { settings, connected: true }; },
    });
    const edit = (text: string) => {
      const field = root.querySelector('textarea')!; field.value = text; field.dispatchEvent(new Event('input'));
      root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    };
    edit('First criterion'); await vi.waitFor(() => expect(settings.profiles[0]!.axes[0]!.criterion).toBe('First criterion'));
    edit('Second criterion'); await vi.waitFor(() => expect(settings.profiles[0]!.axes[0]!.criterion).toBe('Second criterion'));
  });
  it('defaults to no consent, rejects invalid profiles, and averages known enabled axes only', () => {
    const settings = defaultDraftSettings();
    expect(parseDraftSettings(undefined).consent).toBe(false);
    const axes = settings.profiles[0]!.axes;
    expect(draftAverage(axes, { clarity: 5, specificity: 3, value: null })).toBe(4);
    expect(draftAverage(axes, {})).toBeNull();
    axes[0]!.enabled = false;
    expect(draftAverage(axes, { clarity: 5, specificity: 3 })).toBe(3);
    settings.selected.reply = 'missing';
    expect(() => parseDraftSettings(settings)).toThrow();
    const invalid = defaultDraftSettings(); invalid.profiles[0]!.axes.forEach(a => { a.enabled = false; });
    expect(() => parseDraftSettings(invalid)).toThrow();
  });
  it('rejects invalid scores and preserves missing context', () => {
    const axes = defaultDraftSettings().profiles[0]!.axes.slice(0, 1);
    expect(parseDraftResult({ answers: { axis0: { type: 'choice', choice: 'unknown' } } }, axes).scores.clarity).toBeNull();
    for (const choice of ['6', '4.5', '05', 'high']) expect(() => parseDraftResult({ answers: { axis0: { type: 'choice', choice } } }, axes)).toThrow();
  });
  it('reuses axis scores across profiles and weight changes without storing draft text', async () => {
    const data: Record<string, unknown> = {};
    const storage = {
      get: async (keys: string[] | null) => keys ? Object.fromEntries(keys.map(k => [k, data[k]])) : { ...data },
      set: async (values: Record<string, unknown>) => { Object.assign(data, values); },
      remove: async (keys: string[]) => { keys.forEach(k => { delete data[k]; }); },
    };
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ answers: Object.fromEntries(Object.keys(body.questions).map(id => [id, { type: 'choice', choice: '4' }])) }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const scorer = createDraftScorer(storage);
    const axes = defaultDraftSettings().profiles[0]!.axes;
    await scorer.check(draft(), readyState().settings.profile, axes, 'test-key');
    axes[0]!.weight = 5;
    await scorer.check({ ...draft(), profileId: 'custom' }, readyState().settings.profile, axes, 'test-key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    axes[0]!.criterion = 'A different criterion';
    await scorer.check(draft(), readyState().settings.profile, axes, 'test-key');
    expect(Object.keys(JSON.parse(fetchMock.mock.calls[1]![1].body as string).questions)).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain(draft().text);
    expect(JSON.stringify(data)).not.toContain('test-key');
  });
});

function composer() {
  const host = document.createElement('div');
  host.innerHTML = '<div data-testid="tweetTextarea_0" contenteditable="true" role="textbox"></div><button data-testid="tweetButton">Post</button>';
  document.body.append(host);
  return { host, editor: host.querySelector<HTMLElement>('[contenteditable]')! };
}
async function setup(check: DraftApi['check'] = vi.fn().mockResolvedValue({ scores: { clarity: 4, specificity: 3 } }), consent = true) {
  vi.useFakeTimers();
  const state = { settings: defaultDraftSettings(), connected: true }; state.settings.consent = consent;
  const api: DraftApi = { state: vi.fn(async () => structuredClone(state)), check, select: vi.fn(async () => undefined), options: vi.fn(async () => undefined) };
  let url = 'https://x.com/home';
  const feed = startDraftScoring(api, document, () => url); stop = feed.dispose;
  const view = composer();
  await vi.advanceTimersByTimeAsync(0);
  const type = (text: string) => { view.editor.textContent = text; view.editor.dispatchEvent(new Event('input', { bubbles: true })); };
  return { ...view, api, state, feed, type, navigate: (path: string) => { url = `https://x.com${path}`; feed.navigate(); } };
}

describe('draft composer', () => {
  it('debounces edits and preserves the editor and panel', async () => {
    const { type, api, editor, host } = await setup();
    const panel = host.querySelector('[data-jevx-ui="draft"]');
    type('First'); await vi.advanceTimersByTimeAsync(800);
    type('Final'); await vi.advanceTimersByTimeAsync(999);
    expect(api.check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.check).toHaveBeenCalledTimes(1);
    expect(api.check).toHaveBeenCalledWith(expect.objectContaining({ text: 'Final' }));
    expect(host.querySelector('[contenteditable]')).toBe(editor);
    expect(host.querySelector('[data-jevx-ui="draft"]')).toBe(panel);
    expect(panel?.textContent).toContain('Improve specificity');
  });
  it('sends no drafts without separate consent or on Notifications', async () => {
    const { type, api, state, feed, navigate, host } = await setup(undefined, false);
    type('Private draft'); await vi.advanceTimersByTimeAsync(2000);
    expect(api.check).not.toHaveBeenCalled();
    state.settings.consent = true; await feed.refresh();
    navigate('/notifications/mentions'); await vi.advanceTimersByTimeAsync(2000);
    expect(host.querySelector('[data-jevx-ui]')).toBeNull();
    expect(api.check).not.toHaveBeenCalled();
  });
  it('waits for composition to end before sending text', async () => {
    const { editor, type, api } = await setup();
    editor.dispatchEvent(new Event('compositionstart')); type('変');
    await vi.advanceTimersByTimeAsync(2000); expect(api.check).not.toHaveBeenCalled();
    editor.dispatchEvent(new Event('compositionend'));
    await vi.advanceTimersByTimeAsync(1000); expect(api.check).toHaveBeenCalledTimes(1);
  });
  it('discards stale results and sends only the latest waiting draft', async () => {
    let resolve!: (result: DraftResult) => void;
    const check = vi.fn<DraftApi['check']>().mockImplementationOnce(() => new Promise(done => { resolve = done; }))
      .mockResolvedValue({ scores: { clarity: 2 } });
    const { type, host } = await setup(check);
    type('First'); await vi.advanceTimersByTimeAsync(1000);
    type('Second'); await vi.advanceTimersByTimeAsync(1000);
    type('Third'); await vi.advanceTimersByTimeAsync(1000);
    expect(check).toHaveBeenCalledTimes(1);
    resolve({ scores: { clarity: 5 } }); await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(2);
    expect(check.mock.calls[1]![0].text).toBe('Third');
    expect(host.querySelector('.jevx-draft-number strong')?.textContent).toBe('2');
  });
  it('does not apply results to a closed composer or score an empty draft', async () => {
    let resolve!: (result: DraftResult) => void;
    const check = vi.fn<DraftApi['check']>().mockImplementation(() => new Promise(done => { resolve = done; }));
    const { type, host } = await setup(check);
    await vi.advanceTimersByTimeAsync(1000); expect(check).not.toHaveBeenCalled();
    type('Draft'); await vi.advanceTimersByTimeAsync(1000);
    host.remove(); await vi.advanceTimersByTimeAsync(0);
    resolve({ scores: { clarity: 5 } }); await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('[data-jevx-ui="draft"]')).toBeNull();
  });
  it('includes quoted text and marks missing reply context', () => {
    const { host, editor } = composer(); editor.textContent = 'My response';
    expect(readDraft(editor, host, 'https://x.com/author/status/123', 'conversation')).toMatchObject({ kind: 'reply', contextMissing: true });
    const quote = document.createElement('div'); quote.dataset.testid = 'quoteTweet'; quote.innerHTML = '<div data-testid="tweetText">The quoted text</div>'; host.prepend(quote);
    expect(readDraft(editor, host, 'https://x.com/compose/post', 'conversation')).toMatchObject({ kind: 'quote', parentText: 'The quoted text', contextMissing: false });
  });
});
