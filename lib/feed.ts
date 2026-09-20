import { extractPost, POST_SELECTOR } from './extract';
import { exclusion, isScore, type Post, type PostResult, type PublicState } from './model';
import { compareScores, nextScoreChange, scorePost, type PostScore } from './ranking';
import { postActions } from './post-actions';

const RECENT_POST_WINDOW_MS = 60 * 60 * 1000;

export interface FeedApi {
  state(): Promise<PublicState>;
  check(post: Post): Promise<PostResult>;
  toggle(enabled: boolean): Promise<unknown>;
  override(post: Post, show: boolean): Promise<unknown>;
  explore(query: string): Promise<unknown>;
  options(): Promise<unknown>;
}

interface Entry {
  post: Post;
  signature: string;
  needsRender: boolean;
  result?: PostResult;
  shown: boolean;
  checking: boolean;
}

function button(label: string, action: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); action(); });
  return element;
}

export function startFeed(api: FeedApi, root: Document = document, locationUrl = () => location.href) {
  const entries = new Map<HTMLElement, Entry>();
  const overrides = new Map<string, boolean>();
  let state: PublicState | undefined;
  let generation = 0;
  let scheduled = false;
  let disposed = false;
  let processing = false;
  let showAll = false;
  let showRanking = false;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let toolbar: HTMLElement | undefined;
  let rankingPanel: HTMLElement | undefined;
  let feedUrl = locationUrl();
  let resetPending = false;
  let refreshRequest = 0;
  let rankingSignature = '';

  function notificationsOpen() {
    const path = new URL(locationUrl()).pathname;
    return path === '/notifications' || path.startsWith('/notifications/');
  }

  function composerOpen() {
    return new URL(locationUrl()).pathname.startsWith('/compose/') ||
      Boolean(root.querySelector('[role="dialog"] [data-testid^="tweetTextarea_"]'));
  }

  function cleanup(article: HTMLElement) {
    article.querySelectorAll('[data-jevx-recent]').forEach(time => time.removeAttribute('data-jevx-recent'));
    delete article.dataset.jevxState;
    article.querySelectorAll(':scope > [data-jevx-ui]').forEach(node => node.remove());
    const original = article.dataset.jevxOriginalLabel;
    if (original !== undefined) {
      if (original) article.setAttribute('aria-labelledby', original);
      else article.removeAttribute('aria-labelledby');
      delete article.dataset.jevxOriginalLabel;
      article.removeAttribute('aria-label');
    }
  }

  function render(article: HTMLElement, entry: Entry) {
    if (notificationsOpen()) return;
    if (composerOpen()) { entry.needsRender = true; return; }
    entry.needsRender = false;
    cleanup(article);
    if (!state?.settings.enabled || showAll) return;
    const result = entry.result;
    const reason = result?.status === 'assessed' ? result.assessment.reason : result?.reason;
    const collapse = result?.status === 'excluded' || (result?.status === 'assessed' &&
      (result.assessment.decision === 'collapse' || (result.assessment.decision === 'needs_context' && result.assessment.reason !== 'Your choice')));
    const ui = document.createElement('div');
    ui.dataset.jevxUi = 'post';
    ui.className = 'jevx-post-controls';
    ui.addEventListener('click', event => event.stopPropagation());
    if (collapse && !entry.shown) {
      article.dataset.jevxState = 'collapsed';
      article.dataset.jevxOriginalLabel = article.getAttribute('aria-labelledby') ?? '';
      article.removeAttribute('aria-labelledby');
      article.setAttribute('aria-label', 'Filtered post');
      const label = document.createElement('span');
      label.textContent = result?.status === 'excluded' ? result.reason
        : result?.status === 'assessed' && result.assessment.decision === 'needs_context' ? 'More context needed' : 'Filtered post';
      label.title = reason ?? 'Outside your interests';
      ui.append(label, button('Show', () => {
        entry.shown = true;
        render(article, entry);
        if (result?.status === 'assessed') void api.override(entry.post, true).catch(showError);
      }));
    } else if (result?.status === 'assessed' && result.assessment.decision === 'highlight') {
      article.dataset.jevxState = 'highlight';
      ui.append(...postActions({
        reason: reason ?? '', author: entry.post.author,
        score: () => entryScore(entry),
        explore: query => { void api.explore(query).catch(showError); },
        hide: () => { void api.override(entry.post, false).catch(showError); },
      }));
    } else if (entry.shown || (result?.status === 'assessed' && result.assessment.reason === 'Your choice')) {
      ui.append(button('Collapse', () => {
        entry.shown = false;
        if (result?.status === 'excluded') render(article, entry);
        else void api.override(entry.post, false).catch(showError);
      }));
    } else {
      const label = document.createElement('span');
      label.textContent = entry.checking ? 'Checking…' : result?.status === 'visible' ? result.reason : 'More context needed';
      ui.append(label);
    }
    article.append(ui);
    updateScore(article, entry);
  }

  function entryScore(entry: Entry): PostScore | null {
    const result = entry.result;
    return state && result?.status === 'assessed' && result.assessment.decision === 'highlight' && isScore(result.assessment.relevance)
      ? scorePost(result.assessment.relevance, entry.post.createdAt, state.settings.ranking) : null;
  }

  function updateScore(article: HTMLElement, entry: Entry) {
    article.querySelectorAll('[data-jevx-recent]').forEach(time => time.removeAttribute('data-jevx-recent'));
    const age = Date.now() - entry.post.createdAt;
    if (state?.settings.enabled && !showAll && entry.post.kind === 'post' && age >= 0 && age < RECENT_POST_WINDOW_MS) {
      const time = [...article.querySelectorAll<HTMLElement>('time[datetime]')].find(element => {
        const href = element.closest('a')?.getAttribute('href');
        return href && new URL(href, 'https://x.com').pathname.endsWith(`/status/${entry.post.id}`);
      });
      time?.setAttribute('data-jevx-recent', 'true');
    }
    const badge = article.querySelector<HTMLElement>('[data-jevx-score]');
    const score = entryScore(entry);
    if (!badge || !score || !state) return;
    badge.textContent = `${score.total}/5`;
    badge.title = `Relevance ${score.relevance}/5 · Recency ${score.recency}/5 · Weight ${state.settings.ranking.relevanceWeight}:${state.settings.ranking.recencyWeight}`;
    badge.setAttribute('aria-label', `Score ${score.total} of 5. ${badge.title}`);
  }

  function renderRanking() {
    if (notificationsOpen()) return;
    if (composerOpen()) return;
    if (!showRanking || !toolbar?.isConnected) { rankingPanel?.remove(); rankingSignature = ''; return; }
    const matches = new Map<string, { post: Post; score: PostScore; createdAt: number; entry: Entry }>();
    if (state?.settings.enabled) for (const [article, entry] of entries) {
      const score = entryScore(entry);
      if (article.isConnected && score) matches.set(entry.post.id, { post: entry.post, createdAt: entry.post.createdAt, score, entry });
    }
    const sorted = [...matches.values()].sort((a, b) => compareScores(a, b, state!.settings.ranking));
    const signature = JSON.stringify(sorted.map(match => [match.post.id, match.post.author, match.post.text, match.post.quotedText, match.score]));
    if (signature === rankingSignature && rankingPanel?.isConnected && toolbar.nextElementSibling === rankingPanel) return;
    rankingSignature = signature;
    rankingPanel?.remove();
    rankingPanel = document.createElement('section');
    rankingPanel.dataset.jevxUi = 'ranking';
    rankingPanel.className = 'jevx-ranking';
    rankingPanel.setAttribute('aria-label', 'Top matches');
    const heading = document.createElement('p');
    heading.textContent = 'Top matches · Loaded posts in this tab';
    rankingPanel.append(heading);
    if (!sorted.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Matches appear here as posts are checked.';
      rankingPanel.append(empty);
    }
    for (const match of sorted) {
      const row = document.createElement('div');
      row.className = 'jevx-ranking-row';
      const link = document.createElement('a');
      link.href = `https://x.com/${match.post.author}/status/${match.post.id}`;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      const text = document.createElement('span'); text.textContent = match.post.text || match.post.quotedText;
      const author = document.createElement('small'); author.textContent = `@${match.post.author}`;
      link.append(text, author);
      const controls = document.createElement('div');
      controls.className = 'jevx-post-controls';
      controls.append(...postActions({
        reason: match.entry.result?.status === 'assessed' ? match.entry.result.assessment.reason : '',
        author: match.post.author,
        score: () => entryScore(match.entry),
        explore: query => { void api.explore(query).catch(showError); },
        hide: () => { void api.override(match.post, false).catch(showError); },
      }));
      row.append(link, controls);
      updateScore(row, match.entry);
      rankingPanel.append(row);
    }
    toolbar.after(rankingPanel);
  }

  function showError(error: unknown) {
    const status = toolbar?.querySelector('[role="status"]');
    if (status) status.textContent = error instanceof Error ? error.message : 'Could not complete this action';
  }

  function renderToolbar() {
    if (notificationsOpen()) return;
    if (!state || composerOpen()) return;
    if (!root.querySelector(POST_SELECTOR)) { toolbar?.remove(); rankingPanel?.remove(); return; }
    const column = root.querySelector('[data-testid="primaryColumn"]') ?? root.querySelector('main');
    if (!column) return;
    toolbar?.remove();
    toolbar = document.createElement('div');
    toolbar.dataset.jevxUi = 'toolbar';
    toolbar.className = 'jevx-toolbar';
    const name = document.createElement('span');
    name.className = 'jevx-wordmark';
    name.textContent = 'jevx';
    const toggle = button(state.settings.enabled ? 'Filter on' : 'Filter off', () => {
      void api.toggle(!state?.settings.enabled).catch(showError);
    });
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(state.settings.enabled));
    const reveal = button(showAll ? 'Show filtered view' : 'Show all', () => {
      showAll = !showAll;
      renderToolbar();
      for (const [article, entry] of entries) render(article, entry);
    });
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    status.className = 'jevx-status';
    const settings = button('Settings', () => { void api.options().catch(showError); });
    const ranking = button('Top matches', () => { showRanking = !showRanking; renderToolbar(); });
    ranking.setAttribute('aria-expanded', String(showRanking));
    toolbar.append(name, toggle, reveal, ranking, settings, status);
    column.prepend(toolbar);
    renderRanking();
  }

  function scheduleScoreUpdate() {
    clearTimeout(expiry);
    if (!state || notificationsOpen()) return;
    const now = Date.now();
    const deadlines = [...entries.values()].flatMap(entry => [nextScoreChange(entry.post.createdAt, state!.settings.ranking, now), entry.post.createdAt + RECENT_POST_WINDOW_MS])
      .filter((time): time is number => time !== null && time > now);
    if (deadlines.length) expiry = setTimeout(() => {
      if (!composerOpen() && !notificationsOpen()) {
        for (const [article, entry] of entries) updateScore(article, entry);
        renderRanking();
      }
      scheduleScoreUpdate();
    }, Math.min(Math.min(...deadlines) - now, 2 ** 31 - 1));
  }

  async function process() {
    if (processing || disposed || !state?.settings.enabled || composerOpen() || notificationsOpen()) return;
    processing = true;
    try {
      for (const [article, entry] of entries) {
        if (disposed || !state.settings.enabled || composerOpen() || notificationsOpen()) break;
        if (entry.result || entry.checking || !article.isConnected) continue;
        entry.checking = true;
        render(article, entry);
        const requestedGeneration = generation;
        let result: PostResult;
        try { result = exclusion(entry.post) ?? await api.check(entry.post); }
        catch (error) {
          result = { status: 'visible', reason: error instanceof Error && error.message.includes('Reload this X tab')
            ? error.message : 'Could not check. Pause, then resume to retry' };
        }
        if (disposed) break;
        if (notificationsOpen()) { schedule(); break; }
        if (requestedGeneration !== generation || entries.get(article) !== entry) continue;
        const freshPost = extractPost(article, feedUrl, root.documentElement.lang);
        if (!freshPost || JSON.stringify(freshPost) !== entry.signature) { schedule(); continue; }
        entry.checking = false;
        if (overrides.has(entry.post.id)) continue;
        entry.result = exclusion(entry.post) ?? result;
        render(article, entry);
        renderRanking();
      }
    } finally {
      processing = false;
      if (!disposed && state?.settings.enabled && !composerOpen() && !notificationsOpen() && [...entries.values()].some(entry => !entry.result && !entry.checking)) void process();
    }
  }

  function scan() {
    scheduled = false;
    if (disposed) return;
    if (notificationsOpen()) {
      clearTimeout(expiry);
      toolbar?.remove();
      rankingPanel?.remove();
      rankingSignature = '';
      for (const article of entries.keys()) cleanup(article);
      if (entries.size) generation++;
      entries.clear();
      return;
    }
    if (!state || composerOpen()) return;
    feedUrl = locationUrl();
    if (resetPending) {
      resetPending = false;
      for (const article of entries.keys()) cleanup(article);
      entries.clear();
      renderToolbar();
    }
    if (!toolbar?.isConnected) renderToolbar();
    for (const [article] of entries) if (!article.isConnected) { cleanup(article); entries.delete(article); }
    for (const article of root.querySelectorAll<HTMLElement>(POST_SELECTOR)) {
      const post = extractPost(article, feedUrl, root.documentElement.lang);
      if (!post) { cleanup(article); entries.delete(article); continue; }
      const signature = JSON.stringify(post);
      const existing = entries.get(article);
      if (existing?.signature === signature) {
        if (existing.needsRender) render(article, existing);
        else updateScore(article, existing);
        continue;
      }
      cleanup(article);
      const entry: Entry = { post, signature, needsRender: false, shown: false, checking: false };
      entries.set(article, entry);
      if (!state.settings.enabled) continue;
      entry.result = exclusion(post) ?? (overrides.has(post.id) ? overrideResult(overrides.get(post.id)!) : undefined);
      render(article, entry);
    }
    scheduleScoreUpdate();
    renderRanking();
    void process();
  }

  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(scan);
  }

  function overrideResult(show: boolean): PostResult {
    return { status: 'assessed', assessment: {
      decision: show ? 'needs_context' : 'collapse', reason: 'Your choice', relevance: null,
    } };
  }

  function applyOverride(postId: string, show: boolean) {
    if (disposed) return;
    overrides.set(postId, show);
    for (const entry of entries.values()) {
      if (entry.post.id !== postId || exclusion(entry.post)) continue;
      entry.result = overrideResult(show);
      entry.shown = show;
      entry.needsRender = true;
    }
    schedule();
  }

  const observer = new MutationObserver(records => {
    const changed = records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest('[data-jevx-ui], [role="dialog"]')) return false;
      return record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node =>
        !(node instanceof Element && node.matches('[data-jevx-ui]')));
    });
    if (changed) schedule();
  });
  observer.observe(root.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'datetime'] });

  async function refresh() {
    const request = ++refreshRequest;
    const next = await api.state();
    if (disposed || request !== refreshRequest) return;
    state = next;
    generation++;
    resetPending = true;
    schedule();
  }
  void refresh().catch(showError);
  return {
    refresh,
    applyOverride,
    navigate: schedule,
    dispose() {
      disposed = true; observer.disconnect(); clearTimeout(expiry); toolbar?.remove(); rankingPanel?.remove();
      for (const article of entries.keys()) cleanup(article);
      entries.clear();
    },
  };
}
