import { mountOptions } from '../../lib/ui';
import { uiApi } from '../../lib/ui-api';
import '../../assets/ui.css';

const root = document.querySelector<HTMLElement>('#app')!;
void mountOptions(root, uiApi).catch(() => { root.textContent = 'Could not load settings. Reload this page to retry.'; });
