import { browser } from 'wxt/browser';
import { parseSettings, type Post, type PostResult, type PublicState, type Settings } from './model';

export async function send<T>(message: Record<string, unknown>): Promise<T> {
  let response: { ok: boolean; value?: T; error?: string };
  try {
    response = await browser.runtime.sendMessage(message) as typeof response;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Extension context invalidated')) {
      throw new Error('Extension updated. Reload this X tab.');
    }
    throw error;
  }
  if (!response?.ok) throw new Error(response?.error ?? 'The extension is unavailable. Reload this tab.');
  return response.value as T;
}

export async function getState(): Promise<PublicState> {
  const state = await send<PublicState>({ type: 'state' });
  return { ...state, settings: parseSettings(state.settings) };
}
export const saveSettings = (settings: Settings) => send<PublicState>({ type: 'settings', settings });
export const checkPost = (post: Post) => send<PostResult>({ type: 'assess', post });
