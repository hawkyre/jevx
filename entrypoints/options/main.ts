import { mountOptions } from '../../lib/ui';
import { uiApi } from '../../lib/ui-api';
import { mountDraftSettings } from '../../lib/draft-settings-ui';
import { send } from '../../lib/client';
import type { DraftState } from '../../lib/draft-model';
import '../../assets/ui.css';

const root = document.querySelector<HTMLElement>('#app')!;
void mountOptions(root, uiApi).then(() => mountDraftSettings(root, {
  state: () => send<DraftState>({ type: 'draft-state' }),
  save: settings => send<DraftState>({ type: 'draft-settings', settings }),
})).catch(() => { root.textContent = 'Could not load settings. Reload this page to retry.'; });
