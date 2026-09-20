import { mountOptions, mountPopup, type UiApi } from '../lib/ui';
import { startFeed } from '../lib/feed';
import { article, post, readyState } from './fixtures';
import '../assets/ui.css';
import '../entrypoints/feed.content/style.css';

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
if (view === 'feed') {
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
    } }),
    toggle: async enabled => { await api.toggle(enabled); await feed.refresh(); },
    override: async (post, show) => { overrides.set(post.id, show); await feed.refresh(); },
    explore: async () => undefined,
  }, document, () => 'https://x.com/home');
} else if (view === 'options') {
  document.body.className = 'options';
  await mountOptions(root, api);
} else {
  document.body.className = 'popup';
  await mountPopup(root, api);
}
