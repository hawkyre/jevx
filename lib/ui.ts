import { profileReady, type PublicState, type Settings } from './model';

export interface UiApi {
  state(): Promise<PublicState>;
  save(settings: Settings): Promise<PublicState>;
  toggle(enabled: boolean): Promise<PublicState>;
  connect(key: string): Promise<PublicState>;
  disconnect(): Promise<PublicState>;
  open(): Promise<number>;
  options(): Promise<void>;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing interface element: ${selector}`);
  return element;
}

function report(root: HTMLElement, text: string, error = false) {
  const status = required<HTMLElement>(root, '[role="status"]');
  status.textContent = text;
  status.classList.toggle('error', error);
}

function failure(root: HTMLElement, error: unknown) {
  report(root, error instanceof Error ? error.message : 'Could not save. Try again.', true);
}

export async function mountPopup(root: HTMLElement, api: UiApi) {
  root.innerHTML = `
    <header><h1>jevx<span class="brand-dot">.</span></h1><button class="quiet" id="settings">Settings ↗</button></header>
    <section class="intro"><h2>Find your next conversation.</h2><p>Recent posts. Relevant to you.</p></section>
    <div class="profile-line"><button id="profile" class="text-button">Your profile <span aria-hidden="true">→</span></button><span id="connection" class="muted"></span></div>
    <section aria-labelledby="search-heading"><div class="section-title"><h3 id="search-heading">SEARCHES</h3><span class="muted">Past 60 minutes</span></div>
    <div id="search-list"></div>
    <form id="add-search" class="add-row"><input aria-label="New search" id="new-search" placeholder="Add a phrase or #hashtag" autocomplete="off" required><button class="quiet" type="submit" aria-label="Add search">+</button></form></section>
    <div class="actions"><button id="find" class="primary">Find posts <span aria-hidden="true">↗</span></button><p id="hint" class="hint"></p></div>
    <footer><label class="switch-label"><input id="enabled" type="checkbox" role="switch"><span>Filter across X</span></label><span class="muted">Posts only</span></footer>
    <p role="status" aria-live="polite"></p>`;
  let current = await api.state();
  let saving: Promise<unknown> = Promise.resolve();

  function updateSummary() {
    required<HTMLElement>(root, '#connection').textContent = current.connected ? 'Connected' : 'Connect Jev';
    required<HTMLInputElement>(root, '#enabled').checked = current.settings.enabled;
    const count = current.settings.searches.filter(search => search.selected).length;
    required<HTMLButtonElement>(root, '#find').disabled = count === 0;
    required<HTMLElement>(root, '#hint').textContent = !profileReady(current.settings.profile) || !current.settings.consent
      ? 'Set up your profile to filter posts.'
      : !current.connected ? 'Connect TypeSafe in settings to assess posts.'
      : count === 0 ? 'Select a search to begin.' : `${count} ${count === 1 ? 'search' : 'searches'}. Existing search tabs are reused.`;
  }

  function persist() {
    const snapshot = structuredClone(current.settings);
    saving = saving.then(async () => { await api.save(snapshot); report(root, ''); }).catch(error => failure(root, error));
    updateSummary();
  }

  function renderSearches() {
    const list = required<HTMLElement>(root, '#search-list');
    list.replaceChildren();
    for (const search of current.settings.searches) {
      const row = document.createElement('div');
      row.className = 'search-row';
      const selected = document.createElement('input');
      selected.type = 'checkbox'; selected.checked = search.selected;
      selected.setAttribute('aria-label', `Select ${search.query}`);
      selected.addEventListener('change', () => { search.selected = selected.checked; persist(); });
      const query = document.createElement('input');
      query.type = 'text'; query.value = search.query; query.className = 'query';
      query.setAttribute('aria-label', 'Search terms');
      query.addEventListener('change', () => {
        if (!query.value.trim()) { query.value = search.query; return; }
        search.query = query.value.trim(); selected.setAttribute('aria-label', `Select ${search.query}`); persist();
      });
      const remove = document.createElement('button');
      remove.className = 'quiet remove'; remove.textContent = '×'; remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${search.query}`);
      remove.addEventListener('click', () => {
        current.settings.searches = current.settings.searches.filter(item => item.id !== search.id);
        persist(); renderSearches();
      });
      row.append(selected, query, remove); list.append(row);
    }
    updateSummary();
  }

  root.querySelectorAll('#settings, #profile').forEach(element => element.addEventListener('click', () => { void api.options().catch(error => failure(root, error)); }));
  required<HTMLFormElement>(root, '#add-search').addEventListener('submit', event => {
    event.preventDefault();
    const input = required<HTMLInputElement>(root, '#new-search');
    const query = input.value.trim();
    if (!query) return;
    if (!current.settings.searches.some(search => search.query === query)) current.settings.searches.push({ id: crypto.randomUUID(), query, selected: true });
    input.value = ''; persist(); renderSearches(); input.focus();
  });
  required<HTMLInputElement>(root, '#enabled').addEventListener('change', async event => {
    const enabled = (event.target as HTMLInputElement).checked;
    await saving;
    try { current = await api.toggle(enabled); updateSummary(); } catch (error) { failure(root, error); }
  });
  required<HTMLButtonElement>(root, '#find').addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try { await saving; await api.open(); report(root, 'Searches opened.'); }
    catch (error) { failure(root, error); }
    finally { updateSummary(); }
  });
  renderSearches();
}

export async function mountOptions(root: HTMLElement, api: UiApi) {
  root.innerHTML = `
    <header><h1>jevx<span class="brand-dot">.</span></h1><span class="muted">Your preferences</span></header>
    <section class="intro"><h2>A little context.<br>Better conversations.</h2><p>Tell Jev what makes a post worth your time.</p></section>
    <form id="profile-form" class="profile-form">
      <label>Your background<textarea name="background" rows="2" placeholder="What you build, know, or have experience with"></textarea></label>
      <label>Your interests <span class="muted">Required</span><textarea name="interests" rows="3" placeholder="The topics and problems you want to discuss" required></textarea></label>
      <label>Your audience<textarea name="audience" rows="2" placeholder="The people you want to reach"></textarea></label>
      <label>Leave out<textarea name="exclusions" rows="2" placeholder="Topics or kinds of posts you want to skip"></textarea></label>
      <label class="consent"><input type="checkbox" name="consent"><span>Use Jev to assess posts.<small>Your profile and eligible post text are sent to TypeSafe. TypeSafe usage can incur charges.</small></span></label>
      <button type="submit" class="primary">Save profile</button>
    </form>
    <section class="connection-section" aria-labelledby="connection-heading"><div class="section-title"><h3 id="connection-heading">TYPESAFE</h3><span id="connection-state" class="muted"></span></div>
      <form id="connect-form"><label for="key">Your API key</label><div class="key-row"><input id="key" type="password" autocomplete="off" placeholder="Paste your TypeSafe key" required><button type="submit" class="secondary">Connect</button></div></form>
      <button id="disconnect" class="text-button" hidden>Disconnect</button>
      <p class="hint">Your key is saved in this browser. Disconnect to remove it.</p>
      <a class="text-link" href="https://console.typesafe.ai/" target="_blank" rel="noreferrer">Get a TypeSafe key ↗</a>
    </section><p role="status" aria-live="polite"></p>`;
  let current = await api.state();
  const form = required<HTMLFormElement>(root, '#profile-form');
  for (const name of ['background', 'interests', 'audience', 'exclusions'] as const) {
    required<HTMLTextAreaElement>(form, `[name="${name}"]`).value = current.settings.profile[name];
  }
  required<HTMLInputElement>(form, '[name="consent"]').checked = current.settings.consent;

  function connection() {
    required<HTMLElement>(root, '#connection-state').textContent = current.connected ? 'Connected' : 'Not connected';
    required<HTMLElement>(root, '#connect-form').hidden = current.connected;
    required<HTMLElement>(root, '#disconnect').hidden = !current.connected;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = required<HTMLButtonElement>(form, '[type="submit"]');
    submit.disabled = true;
    try {
      const latest = await api.state();
      const profile = { ...latest.settings.profile };
      for (const name of ['background', 'interests', 'audience', 'exclusions'] as const) {
        profile[name] = required<HTMLTextAreaElement>(form, `[name="${name}"]`).value.trim();
      }
      current = await api.save({ ...latest.settings, profile, consent: required<HTMLInputElement>(form, '[name="consent"]').checked });
      report(root, 'Profile saved. Open the extension to choose your searches.');
    } catch (error) { failure(root, error); }
    finally { submit.disabled = false; }
  });
  required<HTMLFormElement>(root, '#connect-form').addEventListener('submit', async event => {
    event.preventDefault();
    const key = required<HTMLInputElement>(root, '#key');
    const submit = required<HTMLButtonElement>(root, '#connect-form button');
    submit.disabled = true;
    try { current = await api.connect(key.value); key.value = ''; connection(); report(root, 'Key saved. It will be checked with the next post.'); }
    catch (error) { failure(root, error); }
    finally { submit.disabled = false; }
  });
  required<HTMLButtonElement>(root, '#disconnect').addEventListener('click', async () => {
    try { current = await api.disconnect(); connection(); report(root, 'Disconnected.'); }
    catch (error) { failure(root, error); }
  });
  connection();
}
