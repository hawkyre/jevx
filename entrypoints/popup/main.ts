import { mountPopup } from '../../lib/ui';
import { uiApi } from '../../lib/ui-api';
import '../../assets/ui.css';

const root = document.querySelector<HTMLElement>('#app')!;
void mountPopup(root, uiApi).catch(() => { root.textContent = 'Could not load jevx. Reopen the extension to retry.'; });
