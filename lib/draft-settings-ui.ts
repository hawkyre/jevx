import { parseDraftSettings, type DraftSettings, type DraftState } from './draft-model';

export async function mountDraftSettings(root: HTMLElement, api: { state(): Promise<DraftState>; save(settings: DraftSettings): Promise<DraftState> }) {
  let settings = structuredClone((await api.state()).settings);
  let selected = settings.profiles[0]!.id;
  const section = document.createElement('section'); section.className = 'draft-settings connection-section';
  section.innerHTML = `<div class="section-title"><h3>DRAFT SCORING</h3><span class="muted">Your words, your goal</span></div>
    <p class="hint">Score posts, replies, and quotes as you write. Scores measure fit to your criteria, not predicted views.</p>
    <form class="profile-form">
      <label class="consent"><input name="draftConsent" type="checkbox"><span>Assess my unpublished drafts.<small>Send draft text, available parent or quoted text, and my profile to TypeSafe after I stop typing. Uses my saved key. API charges can apply.</small></span></label>
      <a class="text-link" href="privacy.html" target="_blank" rel="noreferrer">Privacy and data use ↗</a>
      <details class="draft-profile-editor"><summary>Profiles & scoring axes <span class="muted">Customize</span></summary>
        <div class="draft-profile-tools"><select aria-label="Profile to edit"></select><button type="button" data-copy>Duplicate</button><button type="button" data-remove>Remove</button></div>
        <label>Profile name<input name="profileName" required></label>
        <p class="hint">Defaults are unvalidated. Each enabled axis starts with equal weight. Missing context is excluded from the average.</p>
        <div data-axes></div><button type="button" class="text-button" data-add>Add an axis +</button>
      </details>
      <button type="submit" class="primary">Save draft settings</button><p role="status" aria-live="polite"></p>
    </form>`;
  root.append(section);
  const form = section.querySelector('form')!;
  const consent = section.querySelector<HTMLInputElement>('[name="draftConsent"]')!;
  consent.checked = settings.consent;
  const select = section.querySelector('select')!;
  const name = section.querySelector<HTMLInputElement>('[name="profileName"]')!;
  const axes = section.querySelector<HTMLElement>('[data-axes]')!;
  const status = section.querySelector<HTMLElement>('[role="status"]')!;
  const current = () => settings.profiles.find(p => p.id === selected)!;
  function render() {
    select.replaceChildren(...settings.profiles.map(p => { const option = document.createElement('option'); option.value = p.id; option.textContent = p.name; return option; }));
    select.value = selected; name.value = current().name;
    section.querySelector<HTMLButtonElement>('[data-remove]')!.disabled = settings.profiles.length === 1;
    axes.replaceChildren();
    for (const axis of current().axes) {
      const row = document.createElement('details'); row.className = 'draft-axis-editor';
      const summary = document.createElement('summary'); summary.textContent = axis.label;
      const fields = document.createElement('div'); fields.className = 'draft-axis-fields';
      const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = axis.enabled;
      const enabledLabel = document.createElement('label'); enabledLabel.className = 'switch-label'; enabledLabel.append(enabled, document.createTextNode('Include in score'));
      enabled.addEventListener('change', () => { axis.enabled = enabled.checked; });
      const label = document.createElement('label'); label.textContent = 'Axis name';
      const title = document.createElement('input'); title.value = axis.label; title.required = true; label.append(title);
      title.addEventListener('input', () => { axis.label = title.value; summary.textContent = title.value || 'New axis'; });
      const criterion = document.createElement('label'); criterion.textContent = 'What does a strong draft do?';
      const textarea = document.createElement('textarea'); textarea.rows = 3; textarea.value = axis.criterion; textarea.required = true; criterion.append(textarea);
      textarea.addEventListener('input', () => { axis.criterion = textarea.value; });
      const weightLabel = document.createElement('label'); weightLabel.textContent = 'Weight';
      const weight = document.createElement('select');
      for (let n = 1; n <= 5; n++) { const o = document.createElement('option'); o.value = String(n); o.textContent = String(n); weight.append(o); }
      weight.value = String(axis.weight); weightLabel.append(weight);
      weight.addEventListener('change', () => { axis.weight = Number(weight.value) as typeof axis.weight; });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Remove axis';
      remove.addEventListener('click', () => { current().axes = current().axes.filter(a => a !== axis); render(); });
      fields.append(enabledLabel, label, criterion, weightLabel, remove); row.append(summary, fields); axes.append(row);
    }
  }
  name.addEventListener('input', () => { current().name = name.value; select.selectedOptions[0]!.textContent = name.value || 'Untitled'; });
  select.addEventListener('change', () => { selected = select.value; render(); });
  section.querySelector('[data-copy]')!.addEventListener('click', () => {
    const copy = structuredClone(current()); copy.id = crypto.randomUUID(); copy.name += ' copy'; settings.profiles.push(copy); selected = copy.id; render();
  });
  section.querySelector('[data-remove]')!.addEventListener('click', () => {
    if (settings.profiles.length === 1) return;
    settings.profiles = settings.profiles.filter(p => p.id !== selected);
    for (const kind of ['post', 'reply', 'quote'] as const) if (settings.selected[kind] === selected) settings.selected[kind] = settings.profiles[0]!.id;
    selected = settings.profiles[0]!.id; render();
  });
  section.querySelector('[data-add]')!.addEventListener('click', () => {
    current().axes.push({ id: crypto.randomUUID(), label: 'New axis', criterion: '', weight: 1, enabled: true }); render();
    axes.querySelector<HTMLDetailsElement>('details:last-child')!.open = true;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); const save = form.querySelector<HTMLButtonElement>('[type="submit"]')!; save.disabled = true;
    try {
      settings.consent = consent.checked;
      settings = structuredClone((await api.save(parseDraftSettings(settings))).settings);
      render();
      status.textContent = 'Draft settings saved.';
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not save'; }
    finally { save.disabled = false; }
  });
  render();
}
