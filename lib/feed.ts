import { extractPost, POST_SELECTOR } from './extract';
import { MAX_POST_AGE_MS, exclusion, type Post, type PostResult, type PublicState } from './model';

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
  generation: number;
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
  let state: PublicState | undefined;
  let generation = 0;
  let scheduled = false;
  let disposed = false;
  let processing = false;
  let showAll = false;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let toolbar: HTMLElement | undefined;
  let previousUrl = '';

  function cleanup(article: HTMLElement) {
    article.classList.remove('jevx-collapsed', 'jevx-highlight');
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
    cleanup(article);
    if (!state?.settings.enabled || showAll) return;
    const result = entry.result;
    const reason = result?.status === 'assessed' ? result.assessment.reason : result?.reason;
    const collapse = result?.status === 'excluded' || (result?.status === 'assessed' && result.assessment.decision === 'collapse');
    const ui = document.createElement('div');
    ui.dataset.jevxUi = 'post';
    ui.className = 'jevx-post-controls';
    ui.addEventListener('click', event => event.stopPropagation());
    if (collapse && !entry.shown) {
      article.classList.add('jevx-collapsed');
      article.dataset.jevxOriginalLabel = article.getAttribute('aria-labelledby') ?? '';
      article.removeAttribute('aria-labelledby');
      article.setAttribute('aria-label', 'Filtered post');
      const label = document.createElement('span');
      label.textContent = 'Filtered post';
      label.title = reason ?? 'Outside your interests';
      ui.append(label, button('Show', () => {
        entry.shown = true;
        render(article, entry);
        if (result?.status === 'assessed') void api.override(entry.post, true).catch(showError);
      }));
    } else if (result?.status === 'assessed' && result.assessment.decision === 'highlight') {
      article.classList.add('jevx-highlight');
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Explore';
      summary.title = reason ?? '';
      const explanation = document.createElement('p');
      explanation.textContent = reason ?? '';
      const input = document.createElement('input');
      input.placeholder = 'Search a related topic';
      input.setAttribute('aria-label', 'Related search');
      const form = document.createElement('form');
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.textContent = 'Search';
      form.append(input, submit);
      form.addEventListener('submit', event => {
        event.preventDefault(); event.stopPropagation();
        if (input.value.trim()) void api.explore(input.value.trim()).catch(showError);
      });
      details.append(summary, explanation,
        button('More from this author', () => { void api.explore(`from:${entry.post.author}`).catch(showError); }), form,
        button('Hide this post', () => { void api.override(entry.post, false).catch(showError); }));
      ui.append(details);
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
  }

  function showError(error: unknown) {
    const status = toolbar?.querySelector('[role="status"]');
    if (status) status.textContent = error instanceof Error ? error.message : 'Could not complete this action';
  }

  function renderToolbar() {
    if (!state) return;
    if (!root.querySelector(POST_SELECTOR)) { toolbar?.remove(); return; }
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
    toolbar.append(name, toggle, reveal, settings, status);
    column.prepend(toolbar);
  }

  function updateExpiry() {
    clearTimeout(expiry);
    const now = Date.now();
    const deadlines = [...entries.values()].map(entry => entry.post.createdAt + MAX_POST_AGE_MS).filter(time => time > now);
    if (deadlines.length) expiry = setTimeout(() => {
      for (const [article, entry] of entries) {
        const excluded = exclusion(entry.post);
        if (excluded) { entry.result = excluded; render(article, entry); }
      }
      updateExpiry();
    }, Math.min(...deadlines) - now);
  }

  async function process() {
    if (processing || disposed || !state?.settings.enabled) return;
    processing = true;
    try {
      for (const [article, entry] of entries) {
        if (disposed || !state.settings.enabled) break;
        if (entry.result || entry.checking || !article.isConnected) continue;
        entry.checking = true;
        render(article, entry);
        const requestedGeneration = generation;
        let result: PostResult;
        try { result = exclusion(entry.post) ?? await api.check(entry.post); }
        catch { result = { status: 'visible', reason: 'Could not check. Pause, then resume to retry' }; }
        if (disposed) break;
        if (requestedGeneration !== generation || entries.get(article) !== entry) continue;
        const freshPost = extractPost(article, locationUrl(), root.documentElement.lang);
        if (!freshPost || JSON.stringify(freshPost) !== entry.signature) { schedule(); continue; }
        entry.checking = false;
        entry.result = exclusion(entry.post) ?? result;
        render(article, entry);
      }
    } finally {
      processing = false;
      if (!disposed && state?.settings.enabled && [...entries.values()].some(entry => !entry.result && !entry.checking)) void process();
    }
  }

  function scan() {
    scheduled = false;
    if (disposed || !state) return;
    const url = locationUrl();
    if (url !== previousUrl) {
      previousUrl = url;
      generation++;
      for (const article of entries.keys()) cleanup(article);
      entries.clear();
      renderToolbar();
    }
    if (!toolbar?.isConnected) renderToolbar();
    for (const [article] of entries) if (!article.isConnected) { cleanup(article); entries.delete(article); }
    for (const article of root.querySelectorAll<HTMLElement>(POST_SELECTOR)) {
      const post = extractPost(article, url, root.documentElement.lang);
      if (!post) { cleanup(article); entries.delete(article); continue; }
      const signature = JSON.stringify(post);
      if (entries.get(article)?.signature === signature) continue;
      cleanup(article);
      const entry: Entry = { post, signature, generation, shown: false, checking: false };
      entries.set(article, entry);
      if (!state.settings.enabled) continue;
      entry.result = exclusion(post) ?? undefined;
      render(article, entry);
    }
    updateExpiry();
    void process();
  }

  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(scan);
  }

  const observer = new MutationObserver(records => {
    const changed = records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest('[data-jevx-ui]')) return false;
      return record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node =>
        !(node instanceof Element && node.matches('[data-jevx-ui]')));
    });
    if (changed) schedule();
  });
  observer.observe(root.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'datetime'] });

  async function refresh() {
    const next = await api.state();
    if (disposed) return;
    state = next;
    generation++;
    for (const article of entries.keys()) cleanup(article);
    entries.clear();
    renderToolbar();
    schedule();
  }
  void refresh().catch(showError);
  return {
    refresh,
    dispose() {
      disposed = true; observer.disconnect(); clearTimeout(expiry); toolbar?.remove();
      for (const article of entries.keys()) cleanup(article);
      entries.clear();
    },
  };
}
