import { browser } from 'wxt/browser';
import { getState, saveSettings, send } from './client';
import type { PublicState } from './model';
import type { UiApi } from './ui';

export const uiApi: UiApi = {
  state: getState, save: saveSettings,
  toggle: enabled => send<PublicState>({ type: 'toggle', enabled }),
  connect: key => send<PublicState>({ type: 'connect', key }),
  disconnect: () => send<PublicState>({ type: 'disconnect' }),
  open: () => send<number>({ type: 'open' }),
  options: () => browser.runtime.openOptionsPage(),
};
