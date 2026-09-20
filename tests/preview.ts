import { mountOptions, mountPopup, type UiApi } from '../lib/ui';
import { startFeed } from '../lib/feed';
import { startDraftScoring } from '../lib/draft-composer';
import { mountDraftSettings } from '../lib/draft-settings-ui';
import { defaultDraftSettings } from '../lib/draft-model';
import { article, post, readyState } from './fixtures';
import '../assets/ui.css';
import '../entrypoints/feed.content/style.css';
import '../entrypoints/feed.content/draft.css';

const state = readyState();
state.settings.searches = [
  { id: 'vocabulary', query: '"remembering vocabulary"', selected: true },
  { id: 'learning', query: '#languagelearning', selected: true },
  { id: 'tools', query: 'language learning tools', selected: false },
];
const view = new URL(location.href).searchParams.get('view');
const api: UiApi = {
  state: async () => structuredClone(state),
  save: async settings => { state.settings = settings; return structuredClone(state); },
  toggle: async enabled => { state.settings.enabled = enabled; return structuredClone(state); },
  connect: async () => { state.connected = true; return structuredClone(state); },
  disconnect: async () => { state.connected = false; return structuredClone(state); },
  open: async () => state.settings.searches.filter(search => search.selected).length,
  options: async () => { location.search = '?view=options'; },
};
const root = document.querySelector<HTMLElement>('#app')!;
const draftState = { settings: defaultDraftSettings(), connected: true };
if (view === 'draft' || view === 'reply') {
  root.style.cssText = 'max-width:600px;margin:64px auto;padding:32px;border:1px solid var(--line);border-radius:20px';
  root.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px"><h1>jevx<span class="brand-dot">.</span></h1><span class="muted">Composer preview · Sample scores</span></div>
    <div data-testid="quoteTweet" role="link" style="border-left:2px solid var(--line);padding:0 0 0 16px;margin-bottom:24px"><span class="muted">@builder</span><p data-testid="tweetText">We shipped a new vocabulary app. How do you know whether practice transfers to real conversations?</p></div>
    <div contenteditable="true" role="textbox" aria-label="Draft text" data-testid="tweetTextarea_0" style="min-height:140px;outline:none;font-size:19px;line-height:1.6">We tested recall a week after practice, using words in new sentences. Session streaks looked great; transfer was the real test. What are you measuring today?</div>
    <div style="display:flex;justify-content:flex-end;margin-top:24px"><button data-testid="tweetButton" disabled class="primary" style="width:auto;border-radius:24px;padding:8px 24px">Post</button></div>`;
  draftState.settings.consent = true;
  if (view === 'reply') {
    const row = document.createElement('div'); row.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:16px';
    const editor = root.querySelector<HTMLElement>('[contenteditable]')!;
    const submit = root.querySelector<HTMLElement>('[data-testid="tweetButton"]')!.parentElement!;
    editor.textContent = 'Post your reply'; editor.style.cssText = 'flex:1;min-width:0;font-size:20px;line-height:1.5;color:var(--muted);outline:none';
    submit.style.marginTop = '0'; submit.querySelector('button')!.textContent = 'Reply';
    row.append(editor, submit); root.append(row);
  }
  const drafts = startDraftScoring({
    state: async () => structuredClone(draftState),
    check: async draft => ({ scores: Object.fromEntries(draftState.settings.profiles.find(p => p.id === draft.profileId)!.axes.filter(a => a.enabled).map(a => [a.id, a.id === 'specificity' ? 3 : 4])) }),
    select: async (kind, id) => { draftState.settings.selected[kind] = id; },
    options: api.options,
  }, document, () => 'https://x.com/compose/post');
  window.addEventListener('pagehide', () => drafts.dispose(), { once: true });
} else if (view === 'feed') {
  root.style.cssText = 'max-width:600px;margin:auto;padding:0;border-inline:1px solid var(--line)';
  root.dataset.testid = 'primaryColumn';
  for (const [index, text] of [
    'I keep forgetting vocabulary a week after studying it. What actually helped you retain words?',
    'The weekend sale starts now. Everything must go.',
    'We are building an open-source tool for language learners. How do you measure whether practice transfers to real conversations?',
    'A new token launch is coming soon.',
  ].entries()) {
    const element = article(post({ id: String(index + 1), text }));
    element.style.cssText = 'display:flex;flex-direction:row;flex-wrap:wrap;border-bottom:1px solid var(--line);padding:20px';
    const content = element.firstElementChild as HTMLElement;
    content.style.cssText = 'width:100%;line-height:1.7';
    element.querySelectorAll('a').forEach(a => { a.style.cssText = 'color:var(--muted);font-size:12px;margin-right:8px;text-decoration:none'; });
    element.querySelectorAll('button').forEach(button => { button.style.cssText = 'margin:16px 16px 0 0;background:transparent;color:var(--muted);font-size:12px'; });
    root.append(element);
  }
  let feed: ReturnType<typeof startFeed>;
  const overrides = new Map<string, boolean>();
  feed = startFeed({
    state: api.state,
    check: async post => ({ status: 'assessed', assessment: {
      decision: overrides.has(post.id) ? overrides.get(post.id) ? 'needs_context' : 'collapse' : ['1', '3'].includes(post.id) ? 'highlight' : 'collapse',
      reason: overrides.has(post.id) ? 'Your choice' : ['1', '3'].includes(post.id) ? 'Matches your interests' : 'Outside your interests',
      relevance: overrides.has(post.id) ? null : ['1', '3'].includes(post.id) ? 5 : 1,
    } }),
    toggle: async enabled => { await api.toggle(enabled); await feed.refresh(); },
    override: async (post, show) => { overrides.set(post.id, show); feed.applyOverride(post.id, show); },
    explore: async () => undefined,
    options: api.options,
  }, document, () => 'https://x.com/home');
} else if (view === 'options') {
  document.body.className = 'options';
  await mountOptions(root, api);
  await mountDraftSettings(root, { state: async () => structuredClone(draftState), save: async settings => { draftState.settings = settings; return structuredClone(draftState); } });
} else {
  document.body.className = 'popup';
  await mountPopup(root, api);
}
