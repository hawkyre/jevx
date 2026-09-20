import { DRAFT_DEBOUNCE_MS, draftAverage, type DraftInput, type DraftKind, type DraftResult, type DraftState, type DraftProfile } from './draft-model';

export const DRAFT_EDITOR_SELECTOR = '[contenteditable="true"][data-testid^="tweetTextarea_"]';
export interface DraftApi {
  state(): Promise<DraftState>;
  check(draft: DraftInput): Promise<DraftResult>;
  select(kind: DraftKind, profileId: string): Promise<unknown>;
  options(): Promise<unknown>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}

export function composerHost(editor: HTMLElement): HTMLElement | null {
  for (let node = editor.parentElement; node && node !== document.body; node = node.parentElement) {
    if (node.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')) return node;
  }
  return null;
}

export function readDraft(editor: HTMLElement, host: HTMLElement, url: string, profileId: string): DraftInput {
  const scope = host.closest('[role="dialog"]') ?? host;
  const text = editor.innerText ?? editor.textContent ?? '';
  const quoted = scope.querySelector('[data-testid="quoteTweet"], [role="link"] [data-testid="tweetText"]');
  const inThread = /\/status\/\d+/.test(new URL(url).pathname);
  const replyLabel = [...scope.querySelectorAll('div[dir]')].some(n => !editor.contains(n) && !n.closest('[data-testid="tweetText"], [data-jevx-ui]') &&
    [...n.childNodes].some(c => c.nodeType === Node.TEXT_NODE && /^Replying to\s/.test(c.textContent ?? '')));
  const kind: DraftKind = quoted && !replyLabel && !scope.querySelector('article[data-testid="tweet"]') ? 'quote'
    : inThread || replyLabel || scope.querySelector('article[data-testid="tweet"]') ? 'reply' : 'post';
  let parent = scope.querySelector<HTMLElement>('article[data-testid="tweet"]');
  if (!parent && inThread) {
    const path = new URL(url).pathname;
    parent = [...document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')].find(a =>
      [...a.querySelectorAll('a[href]')].some(link => new URL(link.getAttribute('href')!, 'https://x.com').pathname === path)) ?? null;
  }
  const contextRoot = parent ?? (quoted ? scope : null);
  const parentText = contextRoot ? [...contextRoot.querySelectorAll('[data-testid="tweetText"]')]
    .filter(n => !editor.contains(n) && !n.closest('[data-jevx-ui]')).map(n => n.textContent ?? '').join('\n') : '';
  return { text: text.trim(), kind, parentText, contextMissing: kind !== 'post' && !parentText.trim(),
    hasMedia: Boolean(host.querySelector('[data-testid="attachments"], [data-testid="tweetPhoto"], [data-testid="videoPlayer"]')), profileId };
}

interface Composer {
  editor: HTMLElement; host: HTMLElement; panel: HTMLElement; profile: HTMLSelectElement; kind: HTMLSelectElement;
  status: HTMLElement; score: HTMLElement; cue: HTMLElement; rows: HTMLElement; details: HTMLDetailsElement;
  signature: string; result?: DraftResult; input?: DraftInput; due: number; composing: boolean; manualKind?: DraftKind;
  events: AbortController;
}

export function startDraftScoring(api: DraftApi, root: Document = document, locationUrl = () => location.href) {
  const composers = new Map<HTMLElement, Composer>();
  let state: DraftState | undefined;
  let disposed = false;
  let refreshId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let scheduled = false;
  let stateSignature = '';
  let rememberedReply = '';
  const excluded = () => /^\/(?:notifications|messages|i\/chat)(?:\/|$)/.test(new URL(locationUrl()).pathname);

  function profileFor(c: Composer): DraftProfile | undefined { return state?.settings.profiles.find(p => p.id === c.profile.value); }
  function attach(c: Composer) {
    let anchor = c.editor;
    while (anchor.parentElement && anchor.parentElement !== c.host) anchor = anchor.parentElement;
    let container: HTMLElement | null = c.host;
    while (container && container !== root.body) {
      const style = getComputedStyle(container);
      if (!((style.display === 'flex' || style.display === 'inline-flex') && style.flexDirection.startsWith('row')) &&
        style.display !== 'grid' && style.display !== 'inline-grid') break;
      anchor = container;
      container = container.parentElement;
    }
    if (anchor.nextElementSibling !== c.panel) anchor.after(c.panel);
  }
  function updateResult(c: Composer) {
    const profile = profileFor(c);
    c.rows.replaceChildren();
    const total = c.result && profile ? draftAverage(profile.axes, c.result.scores) : null;
    c.score.textContent = total === null ? '—' : String(total);
    c.panel.dataset.scored = String(total !== null);
    if (!c.result || !profile) return;
    const axes = profile.axes.filter(a => a.enabled);
    const weakest = axes.filter(a => c.result!.scores[a.id] != null).sort((a, b) => c.result!.scores[a.id]! - c.result!.scores[b.id]!)[0];
    const missing = axes.filter(a => c.result!.scores[a.id] == null).length;
    c.cue.textContent = weakest && c.result.scores[weakest.id]! < 5 ? `Improve ${weakest.label.toLowerCase()}` : 'Review your draft';
    c.status.textContent = missing ? `${axes.length - missing} of ${axes.length} axes assessed` : 'Draft quality · Not a reach forecast';
    for (const axis of axes) {
      const row = el('div', 'jevx-draft-axis');
      const label = el('span', '', axis.label); label.title = axis.criterion;
      const points = el('span', 'jevx-draft-points');
      const value = c.result.scores[axis.id];
      points.setAttribute('aria-hidden', 'true');
      for (let i = 1; i <= 5; i++) { const point = el('i'); point.dataset.filled = String(value != null && i <= value); points.append(point); }
      row.append(label, points, el('span', 'jevx-draft-axis-score', value == null ? 'N/A' : `${value}/5`));
      if (value == null) row.title = 'Missing context or not applicable. Excluded from the average.';
      c.rows.append(row);
    }
  }

  function mount(editor: HTMLElement, host: HTMLElement): Composer {
    const panel = el('section', 'jevx-draft'); panel.dataset.jevxUi = 'draft'; panel.setAttribute('aria-label', 'Draft scorer');
    const top = el('div', 'jevx-draft-top');
    const identity = el('div', 'jevx-draft-identity'); identity.append(el('span', 'jevx-draft-mark', 'j'), el('span', '', 'Draft score'));
    const profile = el('select', 'jevx-draft-profile'); profile.setAttribute('aria-label', 'Optimization profile');
    const picker = el('div', 'jevx-draft-picker'); picker.append(profile);
    const settings = el('button', 'jevx-draft-settings', 'Settings'); settings.type = 'button';
    settings.addEventListener('click', () => { void api.options().catch(error => { status.textContent = String(error); }); });
    top.append(identity, picker, settings);
    const details = el('details');
    const summary = el('summary', 'jevx-draft-summary');
    const number = el('div', 'jevx-draft-number'); const score = el('strong', '', '—'); number.append(score, el('span', '', '/5'));
    const text = el('div', 'jevx-draft-copy'); const cue = el('span', 'jevx-draft-cue', 'Write a draft to begin');
    const status = el('span', 'jevx-draft-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    text.append(cue, status); summary.append(number, text, el('span', 'jevx-draft-chevron', '⌄'));
    const rows = el('div', 'jevx-draft-axes');
    const kind = el('select'); kind.setAttribute('aria-label', 'Draft type');
    for (const [id, label] of [['post', 'Post'], ['reply', 'Reply'], ['quote', 'Quote']] as const) { const o = el('option', '', label); o.value = id; kind.append(o); }
    const foot = el('div', 'jevx-draft-foot'); foot.append(kind, el('span', '', '1–5 · Editable criteria, unvalidated defaults'));
    details.append(summary, rows, foot); panel.append(top, details);
    const events = new AbortController();
    const c: Composer = { editor, host, panel, profile, kind, status, score, cue, rows, details, signature: '', due: 0, composing: false, events };
    profile.addEventListener('change', () => {
      c.signature = '';
      void api.select(c.input?.kind ?? 'post', profile.value).catch(error => { status.textContent = String(error); });
      scan();
    });
    kind.addEventListener('change', () => { c.manualKind = kind.value as DraftKind; c.signature = ''; c.profile.dataset.kind = ''; scan(); });
    const input = () => schedule();
    editor.addEventListener('input', input, { signal: events.signal });
    editor.addEventListener('compositionstart', () => { c.composing = true; c.signature = ''; clearTimeout(timer); }, { signal: events.signal });
    editor.addEventListener('compositionend', () => { c.composing = false; schedule(); }, { signal: events.signal });
    attach(c);
    return c;
  }

  function refreshInput(c: Composer) {
    if (!state) return;
    const draft = readDraft(c.editor, c.host, locationUrl(), c.profile.value);
    if (c.host.closest('[role="dialog"]') && draft.kind !== 'quote' && !draft.parentText && rememberedReply) {
      draft.kind = 'reply'; draft.parentText = rememberedReply; draft.contextMissing = false;
    }
    if (c.manualKind) { draft.kind = c.manualKind; draft.contextMissing = draft.kind !== 'post' && !draft.parentText; }
    if (c.profile.dataset.kind !== draft.kind) {
      c.profile.dataset.kind = draft.kind;
      c.profile.replaceChildren(...state.settings.profiles.map(p => { const o = el('option', '', p.name); o.value = p.id; return o; }));
      c.profile.value = state.settings.selected[draft.kind];
    }
    c.kind.value = draft.kind;
    draft.profileId = c.profile.value;
    const signature = JSON.stringify([draft, profileFor(c), state.settings.consent, state.connected]);
    if (signature === c.signature) return;
    c.signature = signature; c.input = draft; c.result = undefined; c.due = Date.now() + DRAFT_DEBOUNCE_MS;
    updateResult(c);
    c.cue.textContent = !state.settings.consent ? 'Draft scoring is off' : !state.connected ? 'Connect TypeSafe to score' : draft.text ? 'Draft changed' : 'Write a draft to begin';
    c.status.textContent = !state.settings.consent ? 'Enable draft scoring in Settings to send drafts to TypeSafe' : !state.connected ? 'Add your API key in Settings' : draft.text ? 'Waiting for you to finish typing…' : 'Start writing to see your score';
  }

  function arm() {
    clearTimeout(timer);
    if (busy || disposed || excluded() || !state?.settings.consent || !state.connected) return;
    const waiting = [...composers.values()].filter(c => !c.result && !c.composing && c.input?.text && c.due !== Infinity);
    if (waiting.length) timer = setTimeout(() => { void process(); }, Math.max(0, Math.min(...waiting.map(c => c.due)) - Date.now()));
  }

  async function process() {
    if (busy || disposed || excluded() || !state?.settings.consent || !state.connected) return;
    const c = [...composers.values()].find(c => !c.result && !c.composing && c.input?.text && c.due <= Date.now());
    if (!c?.input) { arm(); return; }
    busy = true; const signature = c.signature; const input = c.input;
    c.status.textContent = 'Checking your draft…'; c.panel.setAttribute('aria-busy', 'true'); c.due = Infinity;
    try {
      const result = await api.check(input);
      if (!disposed && !excluded() && c.editor.isConnected && composers.get(c.editor) === c && c.signature === signature && !c.composing) {
        refreshInput(c);
        if (c.signature === signature) { c.result = result; updateResult(c); }
      }
    } catch (error) {
      if (!disposed && c.signature === signature && c.editor.isConnected) {
        c.cue.textContent = 'Could not score this draft';
        c.status.textContent = error instanceof Error ? error.message : 'Edit the draft to try again';
      }
    } finally { busy = false; c.panel.removeAttribute('aria-busy'); arm(); }
  }

  function scan() {
    scheduled = false;
    if (disposed) return;
    if (excluded()) {
      clearTimeout(timer);
      for (const c of composers.values()) { c.events.abort(); c.panel.remove(); }
      composers.clear(); rememberedReply = ''; return;
    }
    const modal = root.querySelector(`[role="dialog"] ${DRAFT_EDITOR_SELECTOR}`)?.closest('[role="dialog"]');
    for (const [editor, c] of composers) if (!editor.isConnected || !c.host.contains(editor) || (modal && !modal.contains(editor))) { c.events.abort(); c.panel.remove(); composers.delete(editor); }
    if (!root.querySelector('[role="dialog"]')) rememberedReply = '';
    for (const editor of root.querySelectorAll<HTMLElement>(DRAFT_EDITOR_SELECTOR)) {
      if (modal && !modal.contains(editor)) continue;
      if (editor.closest('[data-jevx-ui]')) continue;
      const host = composerHost(editor); if (!host) continue;
      let c = composers.get(editor);
      if (!c) { c = mount(editor, host); composers.set(editor, c); }
      attach(c);
      refreshInput(c);
    }
    arm();
  }
  function schedule() { if (!scheduled && !disposed) { scheduled = true; queueMicrotask(scan); } }
  const observer = new MutationObserver(records => {
    if (records.some(r => {
      const target = r.target instanceof Element ? r.target : r.target.parentElement;
      if (target?.closest('[data-jevx-ui]')) return false;
      return r.type !== 'childList' || [...r.addedNodes, ...r.removedNodes].some(n => !(n instanceof Element && n.matches('[data-jevx-ui]')));
    })) schedule();
  });
  observer.observe(root.body, { childList: true, subtree: true, characterData: true });
  const remember = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    const reply = target?.closest('[data-testid="reply"]');
    if (reply) rememberedReply = [...(reply.closest('article')?.querySelectorAll('[data-testid="tweetText"]') ?? [])].map(n => n.textContent ?? '').join('\n');
  };
  root.addEventListener('click', remember, true);
  root.defaultView?.addEventListener('resize', schedule);
  async function refresh(force = false) {
    const id = ++refreshId; const next = await api.state();
    if (disposed || id !== refreshId) return;
    const signature = JSON.stringify(next);
    if (force || signature !== stateSignature) {
      stateSignature = signature; state = next;
      for (const c of composers.values()) { c.signature = ''; c.profile.dataset.kind = ''; }
    }
    schedule();
  }
  void refresh().catch(() => undefined);
  return { refresh, navigate: schedule, dispose() {
    disposed = true; observer.disconnect(); clearTimeout(timer); root.removeEventListener('click', remember, true);
    root.defaultView?.removeEventListener('resize', schedule);
    for (const c of composers.values()) { c.events.abort(); c.panel.remove(); } composers.clear();
  } };
}
