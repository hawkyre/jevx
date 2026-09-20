import { describe, expect, it, vi } from 'vitest';
const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage } } }));
import { getState, send } from '../lib/client';
import { readyState } from './fixtures';
import { mountOptions, type UiApi } from '../lib/ui';

describe('extension connection errors', () => {
  it('fills defaults when an older background returns settings without concurrency', async () => {
    const state = readyState();
    const { concurrency: _concurrency, ...legacy } = state.settings;
    sendMessage.mockResolvedValueOnce({ ok: true, value: { ...state, settings: legacy } });
    const loaded = await getState();
    expect(loaded.settings.concurrency).toBe(20);
    expect(loaded.settings.profile).toEqual(state.settings.profile);
  });
  it('renders a valid numeric default for legacy settings', async () => {
    const state = readyState();
    delete (state.settings as Partial<typeof state.settings>).concurrency;
    const root = document.createElement('main');
    const api: UiApi = { state: async () => state, save: vi.fn(), toggle: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), open: vi.fn(), options: vi.fn() };
    await mountOptions(root, api);
    const field = root.querySelector<HTMLInputElement>('[name="concurrency"]')!;
    expect(field.valueAsNumber).toBe(20);
    expect(field.checkValidity()).toBe(true);
  });
  it('asks for a tab reload after the extension context is invalidated', async () => {
    sendMessage.mockRejectedValueOnce(new Error('Extension context invalidated.'));
    await expect(send({ type: 'state' })).rejects.toThrow('Extension updated. Reload this X tab.');
  });
});
