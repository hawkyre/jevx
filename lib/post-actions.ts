import type { PostScore } from './ranking';

function action(label: string, run: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', event => { event.stopPropagation(); run(); });
  return button;
}

function popover(label: string, build: (panel: HTMLElement, position: () => void) => void) {
  const panel = document.createElement('div');
  panel.popover = 'auto';
  panel.dataset.jevxUi = 'popover';
  panel.className = 'jevx-popover';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', label);
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.popoverTargetElement = panel;
  trigger.setAttribute('aria-label', label);
  trigger.addEventListener('click', event => event.stopPropagation());
  const position = () => {
    const anchor = trigger.getBoundingClientRect();
    const size = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(0, Math.min(anchor.right - size.width, window.innerWidth - size.width))}px`;
    const top = anchor.bottom + size.height <= window.innerHeight ? anchor.bottom : anchor.top - size.height;
    panel.style.top = `${Math.max(0, top)}px`;
  };
  panel.addEventListener('beforetoggle', event => {
    if ((event as ToggleEvent).newState === 'open') { panel.replaceChildren(); build(panel, position); }
  });
  panel.addEventListener('toggle', event => {
    if ((event as ToggleEvent).newState === 'open') position();
  });
  panel.addEventListener('click', event => event.stopPropagation());
  return { trigger, panel };
}

export function postActions(options: {
  reason: string;
  author: string;
  score(): PostScore | null;
  explore(query: string): void;
  hide(): void;
}): HTMLElement[] {
  const score = popover('Post score', panel => {
    const heading = document.createElement('p');
    heading.className = 'jevx-popover-heading'; heading.textContent = options.reason;
    const values = options.score();
    const breakdown = document.createElement('dl');
    breakdown.className = 'jevx-score-breakdown';
    if (values) for (const [label, value] of [['Relevance', values.relevance], ['Recency', values.recency]] as const) {
      const term = document.createElement('dt'); term.textContent = label;
      const detail = document.createElement('dd'); detail.textContent = `${value}/5`;
      breakdown.append(term, detail);
    }
    panel.append(heading, breakdown);
  });
  score.trigger.dataset.jevxScore = '';
  score.trigger.className = 'jevx-score-button';

  const menu = popover('Post actions', (panel, position) => {
    const close = () => panel.hidePopover();
    const author = action(`More from @${options.author}`, () => { close(); options.explore(`from:${options.author}`); });
    const related = action('Search related posts', () => {
      const label = document.createElement('label');
      label.className = 'jevx-popover-heading'; label.textContent = 'Related search';
      const input = document.createElement('input');
      input.type = 'search'; input.placeholder = 'Topic or phrase'; input.required = true;
      input.setAttribute('aria-label', 'Related search');
      label.append(input);
      const form = document.createElement('form');
      form.className = 'jevx-related-form';
      const submit = document.createElement('button');
      submit.type = 'submit'; submit.textContent = 'Search'; submit.className = 'jevx-search-submit';
      form.append(label, submit);
      form.addEventListener('submit', event => {
        event.preventDefault(); event.stopPropagation();
        const query = input.value.trim();
        if (query) { close(); options.explore(query); }
      });
      panel.replaceChildren(form); position(); input.focus();
    });
    const hide = action('Hide post', () => { close(); options.hide(); });
    hide.className = 'jevx-hide-action';
    panel.append(author, related, hide);
  });
  menu.trigger.textContent = '⋯';
  menu.trigger.className = 'jevx-more-button';
  menu.trigger.title = 'Post actions';
  return [score.trigger, menu.trigger, score.panel, menu.panel];
}
